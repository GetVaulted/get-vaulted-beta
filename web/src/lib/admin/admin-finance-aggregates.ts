import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  estimatePlatformFeeUsd,
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
  resolveSellerAbsorbedProcessingFeeUsd,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { ensureMarketplacePlatformFeeCache } from "@/services/platform-fee-settings";

/**
 * Same per-order fee-tier resolution the seller sales report uses (`mapSellerSalesOrderForApi`).
 * Using a flat marketplace percent here for every order — as this file previously did — silently
 * understates/overstates platform revenue for live-show sales (which use tiered fee percentages
 * based on the show's cumulative GMV) and makes the admin dashboard disagree with what sellers see
 * on their own sales report for the exact same orders.
 */
function resolveOrderFeePercent(o: {
  itemPriceUsd: number;
  paymentStatus: string;
  listing: { isCompanyListing: boolean };
  liveShippingSession: {
    liveShowId: string | null;
    liveShow: { completedSalesGmvUsd: number; finalSalesGmvUsd: number | null; status: string } | null;
  } | null;
}): number {
  const liveShowId = o.liveShippingSession?.liveShowId ?? null;
  const liveShow = o.liveShippingSession?.liveShow ?? null;
  return resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: Boolean(o.listing.isCompanyListing),
    liveShowId,
    liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
    orderItemPriceUsd: o.itemPriceUsd,
    orderPaymentStatus: o.paymentStatus,
  });
}

const PAID_PAYMENT_STATUSES = ["paid", "layaway_completed"] as const;

const paidOrderWhere: Prisma.OrderWhereInput = {
  OR: [
    { paymentStatus: { in: [...PAID_PAYMENT_STATUSES] } },
    { status: { in: ["paid", "shipped", "completed"] } },
  ],
};

export type AdminFinanceSummary = {
  gmvUsd: number | null;
  platformFeesUsd: number | null;
  /** Stripe card processing absorbed by sellers on Connect (company listings = $0). */
  processingFeesUsd: number | null;
  processingFeesEstimated: boolean;
  /** Platform application fees collected on sales (not net of Stripe processing). */
  netRevenueUsd: number | null;
  sellerPayoutsUsd: number | null;
  /** Seller payouts on Stripe Connect rail (destination charges). */
  sellerPayoutsStripeUsd: number | null;
  /** Seller payouts on PayPal rail (platform-held then PayPal Payouts). */
  sellerPayoutsPayPalUsd: number | null;
  pendingPayoutsUsd: number | null;
  refundedOrders: number | null;
  /** TODO: Wire from Stripe Disputes API — count from seller metrics proxy until then. */
  chargebacksDisputes: number | null;
  chargebacksDisputesEstimated: boolean;
  paidOrderCount: number;
  notes: string[];
};

export async function loadAdminFinanceSummary(): Promise<AdminFinanceSummary> {
  const notes: string[] = [];
  await Promise.all([ensureMarketplacePlatformFeeCache(true), ensureLiveShowFeeCache(true)]);

  const paidOrders = await prisma.order.findMany({
    where: paidOrderWhere,
    select: {
      itemPriceUsd: true,
      shippingPriceUsd: true,
      totalUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      payoutReserveAmountCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      stripeProcessingFeeCents: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      sellerPayoutProcessor: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const paidOrderCount = paidOrders.length;
  if (paidOrderCount >= 5000) {
    notes.push("GMV and fee totals capped at 5,000 most recent paid orders — add aggregation endpoint for full history.");
  }

  let gmvUsd = 0;
  let platformFeesUsd = 0;
  let processingFeesUsd = 0;
  let sellerPayoutsUsd = 0;
  let sellerPayoutsStripeUsd = 0;
  let sellerPayoutsPayPalUsd = 0;
  let pendingPayoutsUsd = 0;

  for (const o of paidOrders) {
    const item = Math.max(0, o.itemPriceUsd);
    gmvUsd += item;
    const feePct =
      o.platformFeePercentApplied != null && Number.isFinite(o.platformFeePercentApplied)
        ? Math.max(0, o.platformFeePercentApplied)
        : resolveOrderFeePercent(o);
    const feeUsd = o.listing.isCompanyListing
      ? 0
      : o.platformFeeCents != null && Number.isFinite(o.platformFeeCents)
        ? Math.max(0, o.platformFeeCents) / 100
        : estimatePlatformFeeUsd({ itemPriceUsd: item, platformFeePercent: feePct });
    platformFeesUsd += feeUsd;
    const processingUsd = resolveSellerAbsorbedProcessingFeeUsd({
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      stripeProcessingFeeCents: o.stripeProcessingFeeCents,
      buyerChargeTotalUsd: o.totalUsd,
    });
    processingFeesUsd += processingUsd;

    const sellerNet = estimateSellerOrderPayoutUsd({
      itemPriceUsd: item,
      shippingPriceUsd: o.shippingPriceUsd,
      platformFeePercent: feePct,
      payoutReserveAmountCents: o.payoutReserveAmountCents,
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      stripeProcessingFeeUsd: processingUsd,
    });

    if (o.payoutStatus === "paid_out") {
      const net = Math.max(0, sellerNet);
      sellerPayoutsUsd += net;
      if (o.sellerPayoutProcessor === "PAYPAL") sellerPayoutsPayPalUsd += net;
      else sellerPayoutsStripeUsd += net;
    } else if (o.payoutStatus !== "blocked" && o.payoutStatus !== "manual_review") {
      pendingPayoutsUsd += Math.max(0, sellerNet);
    }
  }

  // Previously counted layaway refunds only — missed the far more common case of a marketplace/
  // live-show order refunded via `executeOrderRefund` or the `charge.refunded` webhook, plus lost
  // disputes (chargebacks), which understated this metric on the admin dashboard.
  const [refundedLayaways, refundedOrders_, chargebackOrders] = await Promise.all([
    prisma.layaway.count({ where: { status: "refunded" } }),
    prisma.order.count({ where: { paymentStatus: "refunded" } }),
    prisma.order.count({ where: { paymentStatus: "chargeback" } }),
  ]);
  const refundedOrders = refundedLayaways + refundedOrders_ + chargebackOrders;

  const metricsAgg = await prisma.sellerPayoutMetrics.aggregate({
    _sum: { unresolvedDisputeCount: true },
  });
  const chargebacksDisputes = metricsAgg._sum.unresolvedDisputeCount ?? 0;
  notes.push("Stripe processing fees are paid by sellers on Connect — not deducted from platform net.");
  notes.push("Chargeback/dispute count sums seller unresolved disputes — not full Stripe dispute history.");
  notes.push("Seller payouts are split by sellerPayoutProcessor (Stripe Connect vs PayPal Payouts).");

  return {
    gmvUsd: Math.round(gmvUsd * 100) / 100,
    platformFeesUsd: Math.round(platformFeesUsd * 100) / 100,
    processingFeesUsd: Math.round(processingFeesUsd * 100) / 100,
    processingFeesEstimated: true,
    netRevenueUsd: Math.round(platformFeesUsd * 100) / 100,
    sellerPayoutsUsd: Math.round(sellerPayoutsUsd * 100) / 100,
    sellerPayoutsStripeUsd: Math.round(sellerPayoutsStripeUsd * 100) / 100,
    sellerPayoutsPayPalUsd: Math.round(sellerPayoutsPayPalUsd * 100) / 100,
    pendingPayoutsUsd: Math.round(pendingPayoutsUsd * 100) / 100,
    refundedOrders,
    chargebacksDisputes,
    chargebacksDisputesEstimated: true,
    paidOrderCount,
    notes,
  };
}

export type AdminFinanceChartPoint = { label: string; gmvUsd: number; platformFeesUsd: number };

export async function loadAdminFinanceCharts(period: "daily" | "weekly" | "monthly"): Promise<AdminFinanceChartPoint[]> {
  await Promise.all([ensureMarketplacePlatformFeeCache(true), ensureLiveShowFeeCache(true)]);
  const now = new Date();
  const buckets: { start: Date; end: Date; label: string }[] = [];

  if (period === "daily") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const end = new Date(d);
      end.setUTCDate(end.getUTCDate() + 1);
      buckets.push({
        start: d,
        end,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
  } else if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      buckets.push({
        start,
        end,
        label: `W-${12 - i}`,
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      buckets.push({
        start: d,
        end,
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      });
    }
  }

  const since = buckets[0]?.start ?? new Date(now.getTime() - 90 * 86400000);
  const orders = await prisma.order.findMany({
    where: { ...paidOrderWhere, createdAt: { gte: since } },
    select: {
      createdAt: true,
      itemPriceUsd: true,
      paymentStatus: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 8000,
  });

  return buckets.map((b) => {
    const inBucket = orders.filter((o) => o.createdAt >= b.start && o.createdAt < b.end);
    let gmvUsd = 0;
    let platformFeesUsd = 0;
    for (const o of inBucket) {
      const item = Math.max(0, o.itemPriceUsd);
      gmvUsd += item;
      if (!o.listing.isCompanyListing) {
        const feePct =
          o.platformFeePercentApplied != null && Number.isFinite(o.platformFeePercentApplied)
            ? Math.max(0, o.platformFeePercentApplied)
            : resolveOrderFeePercent(o);
        platformFeesUsd +=
          o.platformFeeCents != null && Number.isFinite(o.platformFeeCents)
            ? Math.max(0, o.platformFeeCents) / 100
            : estimatePlatformFeeUsd({
                itemPriceUsd: item,
                platformFeePercent: feePct,
              });
      }
    }
    return {
      label: b.label,
      gmvUsd: Math.round(gmvUsd * 100) / 100,
      platformFeesUsd: Math.round(platformFeesUsd * 100) / 100,
    };
  });
}
