import { prisma } from "@/lib/prisma";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import {
  applyOutstandingLiabilityRecovery,
  planOutstandingLiabilityRecoveryForSeller,
} from "@/services/shipping/label-liability-recovery";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";

export type MarkSellerPayPalOrdersAlreadyPaidResult =
  | {
      ok: true;
      marked: number;
      orderIds: string[];
      grossOwedUsd: number;
      liabilityRecoveredUsd: number;
      sentUsd: number;
    }
  | { ok: false; error: string };

/**
 * Admin: record that a seller's outstanding PayPal-rail balance was already paid off-platform
 * (e.g. the admin sent it directly via PayPal or Stripe themselves) rather than through the
 * automated PayPal Payouts API. This never calls PayPal — it only updates records — so it is the
 * right tool when money already moved by some other means and the system just needs to stop
 * treating these orders as owed (and stop ever trying to release them again automatically).
 *
 * Unlike a raw "mark paid_out" write, this ALSO runs the same outstanding-shipping-liability
 * recovery that a real release would have applied (`planOutstandingLiabilityRecoveryForSeller` /
 * `applyOutstandingLiabilityRecovery`) — skipping that step here would silently and permanently
 * forfeit any label-cost clawback this seller still owes, since it only ever runs at the moment a
 * payout leaves the platform.
 */
export async function markSellerPayPalOrdersAlreadyPaid(args: {
  sellerId: string;
  adminId: string;
  reason: string;
}): Promise<MarkSellerPayPalOrdersAlreadyPaidResult> {
  const sellerId = args.sellerId.trim();
  if (!sellerId) return { ok: false, error: "sellerId required" };
  const reason = args.reason.trim();
  if (!reason) return { ok: false, error: "Reason is required." };

  const orders = await prisma.order.findMany({
    where: {
      sellerId,
      sellerPayoutProcessor: "PAYPAL",
      paymentStatus: "paid",
      payoutStatus: { not: OrderPayoutStatus.paid_out },
      processorTransferId: null,
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      referralCreditAppliedUsd: true,
      platformCreditAppliedUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      liveShippingSessionId: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
  });

  if (orders.length === 0) {
    return { ok: true, marked: 0, orderIds: [], grossOwedUsd: 0, liabilityRecoveredUsd: 0, sentUsd: 0 };
  }

  let grossOwedUsd = 0;
  const previousStatuses = new Map<string, string>();
  for (const o of orders) {
    previousStatuses.set(o.id, o.payoutStatus);
    const saleBasisUsd = orderItemSaleBasisUsd(o);
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const feePct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: o.listing.isCompanyListing,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
      orderItemPriceUsd: saleBasisUsd,
      orderPaymentStatus: o.paymentStatus,
    });
    grossOwedUsd += estimateSellerOrderPayoutUsd({
      itemPriceUsd: saleBasisUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      platformFeePercent: feePct,
      payoutReserveAmountCents: 0,
      shippingLabelCostCents: o.shippingLabelCostCents ?? 0,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents ?? 0,
    });
  }
  const grossOwedCents = Math.round(grossOwedUsd * 100);

  const liabilityPlan = await planOutstandingLiabilityRecoveryForSeller(sellerId, Math.max(0, grossOwedCents));
  const transactionId = `manual-paypal-paid:seller:${sellerId}:${Date.now()}`;
  if (liabilityPlan.items.length > 0) {
    await applyOutstandingLiabilityRecovery(liabilityPlan, { method: "manual_admin", transactionId });
  }

  const now = new Date();
  const orderIds = orders.map((o) => o.id);
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: {
      payoutStatus: OrderPayoutStatus.paid_out,
      payoutReleasedAt: now,
      payoutBlockedReason: null,
      paypalPayoutStatus: "success",
      processorTransferId: transactionId,
    },
  });
  await prisma.order.updateMany({
    where: { id: { in: orderIds }, fundsReleasedAt: null },
    data: { fundsReleasedAt: now },
  });

  for (const o of orders) {
    await logPayoutEligibilityDecision({
      sellerId,
      orderId: o.id,
      adminId: args.adminId,
      action: "seller_paypal_orders_marked_already_paid",
      previousStatus: previousStatuses.get(o.id) ?? null,
      newStatus: OrderPayoutStatus.paid_out,
      reason,
    });
  }

  const liabilityRecoveredUsd = Math.round(liabilityPlan.totalCents) / 100;
  const sentUsd = Math.round((grossOwedCents - liabilityPlan.totalCents)) / 100;

  return {
    ok: true,
    marked: orderIds.length,
    orderIds,
    grossOwedUsd: Math.round(grossOwedCents) / 100,
    liabilityRecoveredUsd,
    sentUsd,
  };
}
