import { prisma } from "@/lib/prisma";
import { createSellerPayPalPayout, isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import {
  OrderPayoutStatus,
  OrderPaymentMethod,
} from "@/generated/prisma/enums";

/**
 * Execute PayPal Payout for a platform-held order and stamp processor ids.
 * Returns true when payout was created (or already recorded).
 */
export async function releaseSellerPayPalPayout(orderId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPayPalSellerPayoutsEnabled()) {
    return { ok: false, reason: "paypal_payouts_disabled" };
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
      referralCreditAppliedUsd: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      platformFeeCents: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
      seller: {
        select: {
          paypalPayoutEmail: true,
          paypalPayoutVerifiedAt: true,
        },
      },
    },
  });

  if (!order || order.paymentStatus !== "paid") {
    return { ok: false, reason: "order_not_paid" };
  }
  if (order.sellerPayoutProcessor !== "PAYPAL") {
    return { ok: false, reason: "not_paypal_rail" };
  }
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    return { ok: false, reason: "escrow_uses_trustap" };
  }
  if (order.processorTransferId?.trim()) {
    return { ok: true, reason: "already_paid_out" };
  }
  if (order.payoutStatus === OrderPayoutStatus.paid_out) {
    return { ok: true, reason: "already_paid_out" };
  }

  const email = order.seller.paypalPayoutEmail?.trim();
  if (!email || !order.seller.paypalPayoutVerifiedAt) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: "PayPal payout email missing or unverified",
        paypalPayoutStatus: "failed",
      },
    });
    return { ok: false, reason: "paypal_email_not_ready" };
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
  });

  if (netUsd < 0.01) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paypalPayoutStatus: "success",
        paypalPayoutFeeCents: 0,
        processorTransferId: `zero-net:${orderId}`,
      },
    });
    return { ok: true, reason: "zero_net" };
  }

  try {
    const result = await createSellerPayPalPayout({
      orderId,
      sellerEmail: email,
      amountUsd: netUsd,
      note: `Get Vaulted seller payout for order ${orderId}`,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        processorTransferId: result.payoutItemId,
        paypalPayoutFeeCents: result.feeCents,
        paypalPayoutStatus: result.rawStatus.toLowerCase().includes("success")
          ? "success"
          : "pending",
      },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[releaseSellerPayPalPayout] failed", orderId, msg);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: `PayPal payout failed: ${msg.slice(0, 180)}`,
        paypalPayoutStatus: "failed",
      },
    });
    return { ok: false, reason: msg };
  }
}

/** Apply async PayPal webhook status onto an order by payout item / batch id. */
export async function applyPayPalPayoutWebhookStatus(args: {
  eventId: string;
  payoutItemId?: string | null;
  batchId?: string | null;
  status: string;
}): Promise<void> {
  const claimed = await prisma.processedPayPalEvent.createMany({
    data: [{ id: args.eventId }],
    skipDuplicates: true,
  });
  if (claimed.count === 0) return;

  const status = args.status.toLowerCase();
  const mapped =
    status.includes("success") || status === "unclaimed"
      ? status.includes("unclaimed")
        ? "unclaimed"
        : "success"
      : status.includes("return")
        ? "returned"
        : status.includes("fail") || status.includes("denied")
          ? "failed"
          : "pending";

  const where =
    args.payoutItemId || args.batchId
      ? {
          OR: [
            ...(args.payoutItemId ? [{ processorTransferId: args.payoutItemId }] : []),
            ...(args.batchId ? [{ processorTransferId: args.batchId }] : []),
          ],
          sellerPayoutProcessor: "PAYPAL" as const,
        }
      : null;
  if (!where) return;

  await prisma.order.updateMany({
    where,
    data: {
      paypalPayoutStatus: mapped,
      ...(mapped === "failed" || mapped === "returned"
        ? {
            payoutStatus: OrderPayoutStatus.manual_review,
            payoutBlockedReason: `PayPal payout ${mapped}`,
          }
        : {}),
    },
  });
}
