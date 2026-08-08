import { OrderPaymentMethod, OrderPayoutStatus } from "@/generated/prisma/enums";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { prisma } from "@/lib/prisma";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
  resolveSellerAbsorbedProcessingFeeUsd,
} from "@/lib/seller-payout-estimate";
import { ensureSellerStripeManualPayouts } from "@/lib/seller-stripe-connect";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/** Stripe Connect bank payout ids are `po_…` (distinct from charge transfers `tr_…`). */
export function isStripeBankPayoutId(id: string | null | undefined): boolean {
  return Boolean(id?.trim().startsWith("po_"));
}

export function orderLooksShippedForBankPayout(order: {
  shippedAt?: Date | null;
  carrierAcceptedAt?: Date | null;
  fulfillmentStatus?: string | null;
  status?: string | null;
}): boolean {
  if (order.shippedAt || order.carrierAcceptedAt) return true;
  const fulfillment = (order.fulfillmentStatus ?? "").toLowerCase();
  if (
    fulfillment === "shipped" ||
    fulfillment === "in_transit" ||
    fulfillment === "out_for_delivery" ||
    fulfillment === "delivered"
  ) {
    return true;
  }
  const status = (order.status ?? "").toLowerCase();
  return status === "shipped" || status === "delivered";
}

/**
 * GV paid the Shippo label; seller share must already be clawed (or no GV label on the order).
 */
export function orderLabelClawbackSettledForBankPayout(order: {
  shippoTransactionId?: string | null;
  labelUrl?: string | null;
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
}): boolean {
  const hasGvLabel = Boolean(order.shippoTransactionId?.trim() || order.labelUrl?.trim());
  if (!hasGvLabel) return true;
  const cost = Math.max(0, order.shippingLabelCostCents ?? 0);
  if (cost <= 0) return true;
  return Math.max(0, order.shippingLabelCostReversedCents ?? 0) >= cost;
}

/**
 * Pay out net seller proceeds from the connected account to their bank.
 * Requires manual Connect payouts so funds stay held until this call (after ship + label clawback).
 */
export async function releaseSellerStripePayout(
  orderId: string,
  opts?: { force?: boolean },
): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "stripe_not_configured" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      paymentMethod: true,
      sellerPayoutProcessor: true,
      processorTransferId: true,
      payoutStatus: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      totalUsd: true,
      referralCreditAppliedUsd: true,
      platformCreditAppliedUsd: true,
      stripeProcessingFeeCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippoTransactionId: true,
      labelUrl: true,
      shippedAt: true,
      carrierAcceptedAt: true,
      fulfillmentStatus: true,
      status: true,
      liveShippingSessionId: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
      seller: {
        select: {
          stripeAccountId: true,
          stripeOnboardingComplete: true,
          stripePayoutsEnabled: true,
        },
      },
    },
  });

  if (!order || order.paymentStatus !== "paid") {
    return { ok: false, reason: "order_not_paid" };
  }
  if (order.sellerPayoutProcessor === "PAYPAL") {
    return { ok: false, reason: "not_stripe_rail" };
  }
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    return { ok: false, reason: "escrow_uses_trustap" };
  }
  if (isStripeBankPayoutId(order.processorTransferId)) {
    return { ok: true, reason: "already_paid_out" };
  }
  if (order.payoutStatus === OrderPayoutStatus.paid_out && isStripeBankPayoutId(order.processorTransferId)) {
    return { ok: true, reason: "already_paid_out" };
  }

  if (!orderLooksShippedForBankPayout(order) && !opts?.force) {
    return { ok: false, reason: "not_shipped" };
  }
  if (!orderLabelClawbackSettledForBankPayout(order) && !opts?.force) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: "label_clawback_pending_before_bank_payout",
      },
    });
    return { ok: false, reason: "label_clawback_pending" };
  }

  if (order.liveShippingSessionId && !opts?.force) {
    const siblings = await prisma.order.findMany({
      where: {
        liveShippingSessionId: order.liveShippingSessionId,
        paymentStatus: "paid",
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        shippedAt: true,
        carrierAcceptedAt: true,
        fulfillmentStatus: true,
        status: true,
      },
    });
    const allShipped = siblings.every((s) => orderLooksShippedForBankPayout(s));
    if (!allShipped) {
      return { ok: false, reason: "live_session_not_fully_shipped" };
    }
  }

  const accountId = order.seller.stripeAccountId?.trim();
  if (!accountId || !order.seller.stripeOnboardingComplete) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: "stripe_connect_not_ready_for_bank_payout",
      },
    });
    return { ok: false, reason: "stripe_not_ready" };
  }

  const stripe = getStripe();
  try {
    await ensureSellerStripeManualPayouts(stripe, accountId);
  } catch (e) {
    console.warn("[releaseSellerStripePayout] could not enforce manual payouts", {
      orderId,
      accountId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const liveShowId = order.liveShippingSession?.liveShowId ?? null;
  const liveShow = order.liveShippingSession?.liveShow ?? null;
  const saleBasisUsd = orderItemSaleBasisUsd(order);
  const feePct = resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: order.listing.isCompanyListing,
    liveShowId,
    liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
    orderItemPriceUsd: saleBasisUsd,
    orderPaymentStatus: order.paymentStatus,
  });
  const netUsd = estimateSellerOrderPayoutUsd({
    itemPriceUsd: saleBasisUsd,
    shippingPriceUsd: order.shippingPriceUsd,
    platformFeePercent: feePct,
    payoutReserveAmountCents: 0,
    shippingLabelCostCents: order.shippingLabelCostCents,
    shippingLabelCostReversedCents: order.shippingLabelCostReversedCents,
    stripeProcessingFeeUsd: resolveSellerAbsorbedProcessingFeeUsd({
      isCompanyListing: order.listing.isCompanyListing,
      stripeProcessingFeeCents: order.stripeProcessingFeeCents,
      buyerChargeTotalUsd: order.totalUsd,
    }),
  });
  const amountCents = Math.round(netUsd * 100);

  if (amountCents < 1) {
    await prisma.order.update({
      where: { id: orderId },
      data: { processorTransferId: `zero-net:${orderId}` },
    });
    return { ok: true, reason: "zero_net" };
  }

  try {
    const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
    const availableUsd = balance.available
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + b.amount, 0);
    if (availableUsd < amountCents) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          payoutBlockedReason: `stripe_available_balance_insufficient:${availableUsd}_need_${amountCents}`,
        },
      });
      return { ok: false, reason: "insufficient_available_balance" };
    }

    const payout = await stripe.payouts.create(
      {
        amount: amountCents,
        currency: "usd",
        metadata: { orderId, sellerId: order.sellerId, source: "get_vaulted_ship_release" },
        statement_descriptor: "GETVAULTED",
      },
      {
        stripeAccount: accountId,
        idempotencyKey: `gv_seller_bank_payout_${orderId}`,
      },
    );

    await prisma.order.update({
      where: { id: orderId },
      data: {
        processorTransferId: payout.id,
        payoutBlockedReason: null,
      },
    });

    console.info("[releaseSellerStripePayout] bank payout created", {
      orderId,
      accountId,
      payoutId: payout.id,
      amountCents,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[releaseSellerStripePayout] failed", { orderId, accountId, error: message });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: `stripe_bank_payout_failed:${message.slice(0, 180)}`,
      },
    });
    return { ok: false, reason: "stripe_payout_failed" };
  }
}
