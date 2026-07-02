import type { Prisma } from "@/generated/prisma/client";
import { marketplacePlatformFeePercent } from "@/lib/platform-fee-policy";
import { prisma } from "@/lib/prisma";
import { estimatePlatformFeeUsd, estimateStripeProcessingFeeUsd } from "@/lib/seller-payout-estimate";

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
  /** Stripe card processing on buyer charges — paid by sellers, shown for reference only. */
  processingFeesUsd: number | null;
  processingFeesEstimated: boolean;
  /** Platform application fees collected on sales (not net of Stripe processing). */
  netRevenueUsd: number | null;
  sellerPayoutsUsd: number | null;
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

  const paidOrders = await prisma.order.findMany({
    where: paidOrderWhere,
    select: {
      itemPriceUsd: true,
      totalUsd: true,
      payoutStatus: true,
      payoutReserveAmountCents: true,
      listing: { select: { isCompanyListing: true } },
    },
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
  let pendingPayoutsUsd = 0;

  for (const o of paidOrders) {
    const item = Math.max(0, o.itemPriceUsd);
    gmvUsd += item;
    if (!o.listing.isCompanyListing) {
      const feePct = marketplacePlatformFeePercent();
      platformFeesUsd += estimatePlatformFeeUsd({ itemPriceUsd: item, platformFeePercent: feePct });
    }
    processingFeesUsd += estimateStripeProcessingFeeUsd(o.totalUsd);

    const sellerNet =
      item -
      (o.listing.isCompanyListing
        ? 0
        : estimatePlatformFeeUsd({ itemPriceUsd: item, platformFeePercent: marketplacePlatformFeePercent() })) -
      Math.max(0, o.payoutReserveAmountCents) / 100;

    if (o.payoutStatus === "paid_out") {
      sellerPayoutsUsd += Math.max(0, sellerNet);
    } else if (o.payoutStatus !== "blocked" && o.payoutStatus !== "manual_review") {
      pendingPayoutsUsd += Math.max(0, sellerNet);
    }
  }

  const refundedOrders = await prisma.layaway.count({ where: { status: "refunded" } });

  const metricsAgg = await prisma.sellerPayoutMetrics.aggregate({
    _sum: { unresolvedDisputeCount: true },
  });
  const chargebacksDisputes = metricsAgg._sum.unresolvedDisputeCount ?? 0;
  notes.push("Stripe processing fees are paid by sellers on Connect — not deducted from platform net.");
  notes.push("Chargeback/dispute count sums seller unresolved disputes — not full Stripe dispute history.");

  return {
    gmvUsd: Math.round(gmvUsd * 100) / 100,
    platformFeesUsd: Math.round(platformFeesUsd * 100) / 100,
    processingFeesUsd: Math.round(processingFeesUsd * 100) / 100,
    processingFeesEstimated: true,
    netRevenueUsd: Math.round(platformFeesUsd * 100) / 100,
    sellerPayoutsUsd: Math.round(sellerPayoutsUsd * 100) / 100,
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
      listing: { select: { isCompanyListing: true } },
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
        platformFeesUsd += estimatePlatformFeeUsd({
          itemPriceUsd: item,
          platformFeePercent: marketplacePlatformFeePercent(),
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
