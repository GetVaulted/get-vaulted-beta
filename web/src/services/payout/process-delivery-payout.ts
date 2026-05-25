import {
  EscrowStatus,
  OrderPaymentMethod,
  OrderPayoutStatus,
} from "@/generated/prisma/enums";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { releaseEscrowFundsFromApproved } from "@/services/escrow/release-when-approved";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";
import {
  evaluateOrderInstantPayoutEligibility,
  evaluateSellerInstantPayoutEligibility,
  type SellerOrderStats,
  type SellerPayoutEligibilitySlice,
} from "@/services/payout/instant-payout-eligibility";

const SELLER_STATS_LOOKBACK_DAYS = 90;

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
  defaultShipFromAddress: {
    select: { line1: true, city: true, state: true, postalCode: true, country: true },
  },
  instantPayoutEligible: true,
  instantPayoutStatus: true,
  instantPayoutOverrideByAdmin: true,
  payoutRiskLevel: true,
  payoutHoldDays: true,
  payoutReservePercent: true,
} as const;

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
  itemPriceUsd: true,
  totalUsd: true,
  payoutStatus: true,
  payoutBlockedReason: true,
  deliveryConfirmedAt: true,
  payoutReleasedAt: true,
  fundsReleasedAt: true,
} as const;

async function loadSellerOrderStats(sellerId: string): Promise<SellerOrderStats> {
  const since = new Date();
  since.setDate(since.getDate() - SELLER_STATS_LOOKBACK_DAYS);

  const orders = await prisma.order.findMany({
    where: { sellerId, paymentStatus: "paid", createdAt: { gte: since } },
    select: {
      trackingNumber: true,
      escrowStatus: true,
      paymentStatus: true,
    },
  });

  const ordersWithTracking = orders.filter((o) => Boolean(o.trackingNumber?.trim())).length;
  const disputedOrRefunded = orders.filter(
    (o) =>
      o.escrowStatus === EscrowStatus.disputed ||
      o.paymentStatus === "refunded" ||
      o.paymentStatus === "refund_requested" ||
      o.paymentStatus === "chargeback",
  ).length;

  return {
    recentPaidOrders: orders.length,
    ordersWithTracking,
    disputedOrRefunded,
  };
}

async function syncSellerInstantPayoutCache(
  seller: SellerPayoutEligibilitySlice,
  stats: SellerOrderStats,
): Promise<ReturnType<typeof evaluateSellerInstantPayoutEligibility>> {
  const evalResult = evaluateSellerInstantPayoutEligibility(seller, stats);
  if (
    seller.instantPayoutEligible !== evalResult.eligible ||
    seller.instantPayoutStatus !== evalResult.status
  ) {
    const prevStatus = seller.instantPayoutStatus;
    await prisma.user.update({
      where: { id: seller.id },
      data: {
        instantPayoutEligible: evalResult.eligible,
        instantPayoutStatus: evalResult.status,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId: seller.id,
      action: "seller_eligibility_evaluated",
      previousStatus: prevStatus,
      newStatus: evalResult.status,
      reason: evalResult.requirementsFailed.join(", ") || "requirements_met",
    });
  }
  return evalResult;
}

async function tryReleaseEscrowInstantPayout(order: {
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
      await logEscrowStatusTransition({
        sellerId: order.sellerId,
        listingId: order.listingId,
        orderId: order.id,
        provider: order.escrowProvider,
        escrowTransactionId: order.escrowTransactionId,
        previousStatus: escrowStatus,
        newStatus: EscrowStatus.delivered,
        source: "system",
      });
      escrowStatus = EscrowStatus.delivered;
    } catch {
      return false;
    }
  }

  if (
    escrowStatus === EscrowStatus.delivered ||
    escrowStatus === EscrowStatus.inspection_period
  ) {
    try {
      assertValidEscrowTransition(escrowStatus, EscrowStatus.approved);
      const prev = escrowStatus;
      await prisma.order.update({
        where: { id: order.id, escrowStatus: prev },
        data: { escrowStatus: EscrowStatus.approved },
      });
      await logEscrowStatusTransition({
        sellerId: order.sellerId,
        listingId: order.listingId,
        orderId: order.id,
        provider: order.escrowProvider,
        escrowTransactionId: order.escrowTransactionId,
        previousStatus: prev,
        newStatus: EscrowStatus.approved,
        source: "system",
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
    console.error("[processDeliveryPayout] escrow release failed", order.id, e);
    return false;
  }
}

/** Mark payout held when payment clears; funds are not released until delivery confirmation. */
export async function initializeOrderPayoutOnPayment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, sellerId: true, payoutStatus: true, itemPriceUsd: true },
  });
  if (!order || order.payoutStatus !== OrderPayoutStatus.pending) return;

  const seller = await prisma.user.findUnique({
    where: { id: order.sellerId },
    select: { payoutReservePercent: true },
  });
  if (!seller) return;

  const reserveCents = Math.round(Math.max(0, order.itemPriceUsd) * 100 * (seller.payoutReservePercent / 100));

  await prisma.order.update({
    where: { id: orderId },
    data: {
      payoutStatus: OrderPayoutStatus.held,
      payoutReserveAmountCents: reserveCents,
    },
  });

  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId,
    action: "order_payout_initialized",
    previousStatus: OrderPayoutStatus.pending,
    newStatus: OrderPayoutStatus.held,
    reason: "payment_confirmed_awaiting_delivery",
  });
}

/**
 * Runs when carrier confirms delivery. Evaluates instant payout eligibility and
 * initiates release for eligible orders (escrow) or marks Stripe orders ready.
 */
export async function processDeliveryPayoutEvaluation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order || order.paymentStatus !== "paid") return;
  if (order.payoutStatus === OrderPayoutStatus.paid_out) return;

  const seller = await prisma.user.findUnique({ where: { id: order.sellerId }, select: sellerSelect });
  if (!seller) return;

  const stats = await loadSellerOrderStats(order.sellerId);
  const sellerEval = await syncSellerInstantPayoutCache(seller, stats);
  const evaluation = evaluateOrderInstantPayoutEligibility({ order, seller, sellerEval });

  const now = new Date();
  const prevPayoutStatus = order.payoutStatus;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryConfirmedAt: order.deliveryConfirmedAt ?? now,
      payoutEligibleAt: evaluation.instantPayoutAllowed ? now : null,
      payoutStatus: evaluation.recommendedStatus,
      payoutMethod: evaluation.recommendedMethod,
      payoutHoldUntil: evaluation.payoutHoldUntil,
      payoutReserveAmountCents: evaluation.payoutReserveAmountCents,
      payoutBlockedReason: evaluation.blockedReason,
    },
  });

  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId,
    action: "order_delivery_confirmed",
    previousStatus: prevPayoutStatus,
    newStatus: OrderPayoutStatus.delivery_confirmed,
    reason: "carrier_delivery_confirmed",
  });

  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId,
    action: "order_payout_evaluated",
    previousStatus: prevPayoutStatus,
    newStatus: evaluation.recommendedStatus,
    reason: evaluation.instantPayoutAllowed
      ? "instant_payout_eligible"
      : evaluation.disqualifiers.join(", ") || evaluation.blockedReason || "standard_payout",
  });

  if (!evaluation.instantPayoutAllowed) {
    if (evaluation.recommendedStatus === OrderPayoutStatus.held) {
      await logPayoutEligibilityDecision({
        sellerId: order.sellerId,
        orderId,
        action: "order_payout_held",
        previousStatus: prevPayoutStatus,
        newStatus: OrderPayoutStatus.held,
        reason: evaluation.blockedReason,
      });
    }
    return;
  }

  await logPayoutEligibilityDecision({
    sellerId: order.sellerId,
    orderId,
    action: "order_instant_payout_ready",
    previousStatus: prevPayoutStatus,
    newStatus: OrderPayoutStatus.instant_payout_ready,
  });

  let released = false;
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    released = await tryReleaseEscrowInstantPayout({
      id: order.id,
      sellerId: order.sellerId,
      listingId: order.listingId,
      escrowTransactionId: order.escrowTransactionId,
      escrowProvider: order.escrowProvider,
      escrowStatus: order.escrowStatus,
      escrowReleasePaused: order.escrowReleasePaused,
    });
  } else {
    // Stripe destination charges transfer at checkout; record delivery-gated payout release for seller visibility.
    released = true;
  }

  if (released) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.paid_out,
        payoutReleasedAt: now,
        ...(order.fundsReleasedAt ? {} : { fundsReleasedAt: now }),
      },
    });
    await logPayoutEligibilityDecision({
      sellerId: order.sellerId,
      orderId,
      action: "order_payout_released",
      previousStatus: OrderPayoutStatus.instant_payout_ready,
      newStatus: OrderPayoutStatus.paid_out,
      reason: order.paymentMethod === OrderPaymentMethod.escrow ? "escrow_released" : "stripe_delivery_confirmed",
    });
  }
}

export async function loadSellerPayoutSummaryForAdmin(sellerId: string) {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      ...sellerSelect,
      instantPayoutOverrideReason: true,
      instantPayoutOverrideAdminId: true,
      instantPayoutOverrideAt: true,
      username: true,
      email: true,
    },
  });
  if (!seller) return null;

  const stats = await loadSellerOrderStats(sellerId);
  const evaluation = evaluateSellerInstantPayoutEligibility(seller, stats);

  const since = new Date();
  since.setDate(since.getDate() - SELLER_STATS_LOOKBACK_DAYS);
  const disputedOrRefunded = await prisma.order.count({
    where: {
      sellerId,
      createdAt: { gte: since },
      OR: [
        { escrowStatus: EscrowStatus.disputed },
        { paymentStatus: { in: ["refunded", "refund_requested", "chargeback"] } },
      ],
    },
  });

  return {
    seller: {
      id: seller.id,
      username: seller.username,
      email: seller.email,
      instantPayoutEligible: seller.instantPayoutEligible,
      instantPayoutStatus: seller.instantPayoutStatus,
      instantPayoutOverrideByAdmin: seller.instantPayoutOverrideByAdmin,
      instantPayoutOverrideReason: seller.instantPayoutOverrideReason,
      instantPayoutOverrideAdminId: seller.instantPayoutOverrideAdminId,
      instantPayoutOverrideAt: seller.instantPayoutOverrideAt?.toISOString() ?? null,
      payoutRiskLevel: seller.payoutRiskLevel,
      payoutHoldDays: seller.payoutHoldDays,
      payoutReservePercent: seller.payoutReservePercent,
      stripePayoutsEnabled: seller.stripePayoutsEnabled,
      hasStripeAccount: Boolean(seller.stripeAccountId && seller.stripeOnboardingComplete),
    },
    evaluation,
    stats: {
      ...stats,
      disputedOrRefundedCount: disputedOrRefunded,
      trackingComplianceRate: evaluation.trackingComplianceRate,
      disputeRefundRate: evaluation.disputeRefundRate,
    },
  };
}

export async function loadOrderPayoutDetailForAdmin(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      ...orderSelect,
      deliveryConfirmedAt: true,
      payoutEligibleAt: true,
      payoutReleasedAt: true,
      payoutMethod: true,
      payoutHoldUntil: true,
      payoutReserveAmountCents: true,
      shippedAt: true,
      carrier: true,
      service: true,
    },
  });
  if (!order) return null;

  const seller = await prisma.user.findUnique({ where: { id: order.sellerId }, select: sellerSelect });
  if (!seller) return null;

  const stats = await loadSellerOrderStats(order.sellerId);
  const sellerEval = evaluateSellerInstantPayoutEligibility(seller, stats);
  const orderEval = evaluateOrderInstantPayoutEligibility({ order, seller, sellerEval });

  return { order, sellerEval, orderEval };
}
