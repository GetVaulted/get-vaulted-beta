import {
  InstantPayoutApprovalStatus,
  OrderPaymentMethod,
  OrderPayoutMethod,
  OrderPayoutStatus,
  SellerPayoutTier,
} from "@/generated/prisma/enums";
import {
  checkInstantPayoutLimits,
  logInstantPayoutLimitFallback,
  recordInstantPayoutRelease,
  reduceOutstandingInstantExposure,
} from "@/services/payout/instant-payout-limits";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { releaseEscrowFundsFromApproved } from "@/services/escrow/release-when-approved";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";
import { EscrowStatus } from "@/generated/prisma/enums";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import {
  evaluateOrderInstantPayoutEligibility,
  evaluateSellerInstantPayoutEligibility,
  type SellerOrderStats,
} from "@/services/payout/instant-payout-eligibility";
import { loadSellerPayoutTierDashboard } from "@/services/payout/recalculate-seller-payout-tier";
import { recalculateSellerPayoutTier } from "@/services/payout/recalculate-seller-payout-tier";

const orderSelect = {
  id: true,
  sellerId: true,
  listingId: true,
  paymentStatus: true,
  paymentMethod: true,
  fulfillmentStatus: true,
  escrowStatus: true,
  escrowReleasePaused: true,
  escrowTransactionId: true,
  escrowProvider: true,
  trackingNumber: true,
  shippingStatus: true,
  shippoTransactionId: true,
  labelUrl: true,
  itemPriceUsd: true,
  totalUsd: true,
  payoutStatus: true,
  payoutMethod: true,
  payoutBlockedReason: true,
  deliveryConfirmedAt: true,
  payoutReleasedAt: true,
  fundsReleasedAt: true,
  labelCreatedAt: true,
  carrierAcceptedAt: true,
} as const;

const sellerSelect = {
  id: true,
  suspendedAt: true,
  sellerSetupWizardCompletedAt: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripePayoutsEnabled: true,
  shipFromStreet: true,
  shipFromCity: true,
  shipFromState: true,
  shipFromZip: true,
  shipFromCountry: true,
  defaultShipFromAddressId: true,
  instantPayoutEligible: true,
  instantPayoutStatus: true,
  instantPayoutOverrideByAdmin: true,
  payoutRiskLevel: true,
  payoutHoldDays: true,
  payoutReservePercent: true,
  payoutTier: true,
} as const;

async function loadSellerOrderStats(sellerId: string): Promise<SellerOrderStats> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const orders = await prisma.order.findMany({
    where: { sellerId, paymentStatus: "paid", createdAt: { gte: since } },
    select: { trackingNumber: true, escrowStatus: true, paymentStatus: true },
  });
  return {
    recentPaidOrders: orders.length,
    ordersWithTracking: orders.filter((o) => Boolean(o.trackingNumber?.trim())).length,
    disputedOrRefunded: orders.filter(
      (o) =>
        o.escrowStatus === EscrowStatus.disputed ||
        o.paymentStatus === "refunded" ||
        o.paymentStatus === "refund_requested" ||
        o.paymentStatus === "chargeback",
    ).length,
  };
}

async function tryReleaseEscrowPayout(order: {
  id: string;
  sellerId: string;
  listingId: string;
  escrowTransactionId: string | null;
  escrowProvider: string | null;
  escrowStatus: EscrowStatus | null;
  escrowReleasePaused: boolean;
}): Promise<boolean> {
  if (!order.escrowTransactionId || order.escrowReleasePaused) return false;
  if (order.escrowStatus === EscrowStatus.funds_released) return true;

  let escrowStatus = order.escrowStatus;

  if (escrowStatus === EscrowStatus.seller_shipped) {
    try {
      assertValidEscrowTransition(escrowStatus, EscrowStatus.delivered);
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowStatus: EscrowStatus.delivered },
      });
      escrowStatus = EscrowStatus.delivered;
    } catch {
      return false;
    }
  }

  if (escrowStatus === EscrowStatus.delivered || escrowStatus === EscrowStatus.inspection_period) {
    try {
      const prev = escrowStatus;
      await prisma.order.update({
        where: { id: order.id, escrowStatus: prev },
        data: { escrowStatus: EscrowStatus.approved },
      });
      escrowStatus = EscrowStatus.approved;
    } catch {
      return false;
    }
  }

  if (escrowStatus !== EscrowStatus.approved) return false;

  try {
    await releaseEscrowFundsFromApproved({
      order: {
        id: order.id,
        sellerId: order.sellerId,
        listingId: order.listingId,
        escrowTransactionId: order.escrowTransactionId,
        escrowProvider: order.escrowProvider,
      },
      auditSource: "system",
    });
    return true;
  } catch (e) {
    console.error("[processPayoutTier] escrow release failed", order.id, e);
    return false;
  }
}

async function finalizeOrderPayoutRelease(
  orderId: string,
  sellerId: string,
  prevStatus: OrderPayoutStatus,
  readyStatus: OrderPayoutStatus,
  method: OrderPayoutMethod,
  reason: string,
  order: {
    paymentMethod: OrderPaymentMethod;
    escrowTransactionId: string | null;
    escrowProvider: string | null;
    escrowStatus: EscrowStatus | null;
    escrowReleasePaused: boolean;
    listingId: string;
    fundsReleasedAt: Date | null;
  },
  recordInstantUsd?: number,
): Promise<void> {
  const now = new Date();

  await logPayoutEligibilityDecision({
    sellerId,
    orderId,
    action: "order_payout_evaluated",
    previousStatus: prevStatus,
    newStatus: readyStatus,
    reason,
  });

  let released = false;
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    released = await tryReleaseEscrowPayout({
      id: orderId,
      sellerId,
      listingId: order.listingId,
      escrowTransactionId: order.escrowTransactionId,
      escrowProvider: order.escrowProvider,
      escrowStatus: order.escrowStatus,
      escrowReleasePaused: order.escrowReleasePaused,
    });
  } else {
    released = true;
  }

  if (!released) return;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: now,
      payoutMethod: method,
      payoutEligibleAt: now,
      ...(order.fundsReleasedAt ? {} : { fundsReleasedAt: now }),
    },
  });

  await logPayoutEligibilityDecision({
    sellerId,
    orderId,
    action: "order_payout_released",
    previousStatus: readyStatus,
    newStatus: OrderPayoutStatus.paid_out,
    reason,
  });

  if (recordInstantUsd != null && recordInstantUsd > 0) {
    await recordInstantPayoutRelease(sellerId, orderId, recordInstantUsd);
  }

  void recalculateSellerPayoutTier(sellerId);
}

type OrderEvalContext = {
  orderBlocked: boolean;
  blockedReason: string | null;
  reserveCents: number;
};

async function loadOrderEvalContext(orderId: string, sellerId: string): Promise<OrderEvalContext | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: sellerSelect });
  if (!order || !seller || order.paymentStatus !== "paid") return null;

  const stats = await loadSellerOrderStats(sellerId);
  const sellerEval = evaluateSellerInstantPayoutEligibility(seller, stats);
  const evaluation = evaluateOrderInstantPayoutEligibility({ order, seller, sellerEval });

  return {
    orderBlocked: evaluation.recommendedStatus === OrderPayoutStatus.blocked,
    blockedReason: evaluation.blockedReason,
    reserveCents: evaluation.payoutReserveAmountCents,
  };
}

/** Instant tier: release when a valid shipping label exists. */
export async function processLabelCreatedPayoutEvaluation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order || order.paymentStatus !== "paid" || order.payoutStatus === OrderPayoutStatus.paid_out) return;
  if (!order.shippoTransactionId && !order.labelUrl) return;

  const dashboard = await loadSellerPayoutTierDashboard(order.sellerId);
  if (
    !dashboard ||
    dashboard.evaluation.instantApprovalStatus !== InstantPayoutApprovalStatus.approved
  ) {
    return;
  }

  const ctx = await loadOrderEvalContext(orderId, order.sellerId);
  if (!ctx || ctx.orderBlocked) return;

  const limitCheck = await checkInstantPayoutLimits(order.sellerId, order.itemPriceUsd);
  if (!limitCheck.allowed) {
    await logInstantPayoutLimitFallback({
      sellerId: order.sellerId,
      orderId,
      reason: limitCheck.reason ?? "instant_limit_exceeded",
      orderAmountUsd: order.itemPriceUsd,
    });
    return;
  }

  const now = new Date();
  const prev = order.payoutStatus;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      labelCreatedAt: order.labelCreatedAt ?? now,
      payoutStatus: OrderPayoutStatus.label_payout_ready,
      payoutReserveAmountCents: ctx.reserveCents,
    },
  });

  await finalizeOrderPayoutRelease(
    orderId,
    order.sellerId,
    prev,
    OrderPayoutStatus.label_payout_ready,
    OrderPayoutMethod.instant_after_label,
    "instant_tier_label_created",
    order,
    order.itemPriceUsd,
  );
}

/** Fast tier: release on first carrier acceptance scan (in transit). */
export async function processCarrierAcceptancePayoutEvaluation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order || order.paymentStatus !== "paid" || order.payoutStatus === OrderPayoutStatus.paid_out) return;

  const dashboard = await loadSellerPayoutTierDashboard(order.sellerId);
  if (!dashboard) return;
  const tier = dashboard.evaluation.effectiveTier;
  if (tier !== SellerPayoutTier.fast && tier !== SellerPayoutTier.instant) return;
  // Instant tier already released on label — skip duplicate release at acceptance.
  if (tier === SellerPayoutTier.instant) return;

  const ctx = await loadOrderEvalContext(orderId, order.sellerId);
  if (!ctx || ctx.orderBlocked) return;

  const now = new Date();
  const prev = order.payoutStatus;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      carrierAcceptedAt: order.carrierAcceptedAt ?? now,
      payoutStatus: OrderPayoutStatus.fast_payout_ready,
      payoutReserveAmountCents: ctx.reserveCents,
    },
  });

  await finalizeOrderPayoutRelease(
    orderId,
    order.sellerId,
    prev,
    OrderPayoutStatus.fast_payout_ready,
    OrderPayoutMethod.fast_after_acceptance,
    "fast_tier_carrier_acceptance",
    order,
  );
}

/** Standard tier: existing delivery-confirmed path (delegates to tier-aware hold). */
export async function processStandardDeliveryPayoutEvaluation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order || order.paymentStatus !== "paid") return;

  if (
    order.payoutStatus === OrderPayoutStatus.paid_out &&
    order.payoutMethod === OrderPayoutMethod.instant_after_label &&
    !order.deliveryConfirmedAt
  ) {
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryConfirmedAt: new Date() },
    });
    await reduceOutstandingInstantExposure(order.sellerId, order.itemPriceUsd);
    return;
  }

  if (order.payoutStatus === OrderPayoutStatus.paid_out) return;

  const dashboard = await loadSellerPayoutTierDashboard(order.sellerId);
  if (!dashboard) return;

  const tier = dashboard.evaluation.effectiveTier;
  if (tier === SellerPayoutTier.instant || tier === SellerPayoutTier.fast) {
    // Higher tiers should have released earlier; delivery is a no-op for payout timing.
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryConfirmedAt: order.deliveryConfirmedAt ?? new Date() },
    });
    return;
  }

  const seller = await prisma.user.findUnique({ where: { id: order.sellerId }, select: sellerSelect });
  if (!seller) return;

  const stats = await loadSellerOrderStats(order.sellerId);
  const sellerEval = evaluateSellerInstantPayoutEligibility(seller, stats);
  const evaluation = evaluateOrderInstantPayoutEligibility({ order, seller, sellerEval });

  const now = new Date();
  const prev = order.payoutStatus;

  if (evaluation.instantPayoutAllowed) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryConfirmedAt: order.deliveryConfirmedAt ?? now,
        payoutStatus: OrderPayoutStatus.instant_payout_ready,
        payoutMethod: OrderPayoutMethod.instant_after_delivery,
        payoutEligibleAt: now,
      },
    });
    await finalizeOrderPayoutRelease(
      orderId,
      order.sellerId,
      prev,
      OrderPayoutStatus.instant_payout_ready,
      OrderPayoutMethod.instant_after_delivery,
      "legacy_instant_after_delivery",
      order,
    );
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryConfirmedAt: order.deliveryConfirmedAt ?? now,
      payoutStatus: evaluation.recommendedStatus,
      payoutMethod: OrderPayoutMethod.standard,
      payoutHoldUntil: evaluation.payoutHoldUntil,
      payoutReserveAmountCents: evaluation.payoutReserveAmountCents,
      payoutBlockedReason: evaluation.blockedReason,
    },
  });

  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId,
    action: "order_delivery_confirmed",
    previousStatus: prev,
    newStatus: OrderPayoutStatus.delivery_confirmed,
    reason: "standard_tier_delivery_confirmed",
  });

  void recalculateSellerPayoutTier(order.sellerId);
}
