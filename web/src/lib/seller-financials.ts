import {
  calendarDayBoundsUtc,
  calendarDayInTimeZone,
  isValidIanaTimeZone,
  zonedLocalToUtc,
} from "@/lib/calendar-day-bounds";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { prisma } from "@/lib/prisma";
import {
  sellerPlatformFeeOverrideSelect,
  sellerUserWithEffectivePlatformFeeOverride,
} from "@/lib/seller-platform-fee-override-user";
import { resolveSellerPlatformFeeDisplay } from "@/lib/seller-platform-fee-display";
import { resolveSellerShippingBreakdown } from "@/lib/seller-shipping-breakdown";
import {
  estimateSellerOrderPayoutUsd,
  estimateStripeProcessingFeeUsd,
} from "@/lib/seller-payout-estimate";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { ensureMarketplacePlatformFeeCache } from "@/services/platform-fee-settings";

export type SellerFinancialActivityRow = {
  id: string;
  title: string;
  buyerUsername: string;
  channel: "marketplace" | "live";
  liveShowTitle: string | null;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  platformFeeUsd: number;
  platformFeePercent: number;
  stripeProcessingFeeUsd: number;
  labelCostUsd: number;
  reserveUsd: number;
  sellerNetUsd: number;
  feesAreEstimates: boolean;
  payoutStatus: string;
  payoutStatusLabel: string;
  occurredAt: string;
  href: string;
};

export type SellerPayoutStatusBucket = {
  status: string;
  label: string;
  orderCount: number;
  sellerNetUsd: number;
};

export type SellerFinancialsSummary = {
  timeZone: string;
  day: string;
  monthLabel: string;
  /** Gross item sales (GMV), not seller net. */
  lifetimeGmvUsd: number;
  monthGmvUsd: number;
  todayGmvUsd: number;
  /** Estimated seller net after platform fee, reserve, label cost, and Stripe processing. */
  lifetimeEarningsUsd: number;
  monthEarningsUsd: number;
  todayEarningsUsd: number;
  marketplaceEarningsUsd: number;
  liveEarningsUsd: number;
  paidOutUsd: number;
  pendingPayoutUsd: number;
  heldOrBlockedUsd: number;
  platformFeesUsd: number;
  stripeProcessingFeesUsd: number;
  labelCostsUsd: number;
  paidOrderCount: number;
  feesAreMostlyEstimates: boolean;
  payoutStatusBreakdown: SellerPayoutStatusBucket[];
  payoutTier: string | null;
  payoutTierLabel: string | null;
  metricsLifetimeGmvUsd: number | null;
  activity: SellerFinancialActivityRow[];
};

function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function centsToUsd(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return money(cents / 100);
}

export function payoutStatusLabel(status: string): string {
  switch (status) {
    case "paid_out":
      return "Paid out";
    case "pending":
      return "Pending";
    case "held":
      return "On hold";
    case "delivery_confirmed":
      return "Delivery confirmed";
    case "fast_payout_ready":
      return "Fast payout ready";
    case "label_payout_ready":
      return "Label payout ready";
    case "instant_payout_ready":
      return "Instant payout ready";
    case "blocked":
      return "Blocked";
    case "manual_review":
      return "Manual review";
    default:
      return status.replace(/_/g, " ");
  }
}

function monthBoundsUtc(day: string, timeZone: string): { start: Date; end: Date } {
  const [y, m] = day.split("-").map(Number);
  const start = zonedLocalToUtc(y, m, 1, 0, 0, 0, timeZone);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = zonedLocalToUtc(nextYear, nextMonth, 1, 0, 0, 0, timeZone);
  return { start, end };
}

function monthLabel(day: string, timeZone: string): string {
  try {
    const [y, m] = day.split("-").map(Number);
    const start = zonedLocalToUtc(y, m, 1, 12, 0, 0, timeZone);
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone });
  } catch {
    return day.slice(0, 7);
  }
}

export function resolveSellerFinancialsTimeZone(tzParam: string | null): string {
  if (tzParam && isValidIanaTimeZone(tzParam)) return tzParam;
  return "America/Chicago";
}

type ComputedSale = {
  at: Date;
  channel: "marketplace" | "live";
  gmvUsd: number;
  netUsd: number;
  platformFeeUsd: number;
  processingFeeUsd: number;
  labelCostUsd: number;
  payoutStatus: string;
  feesAreEstimates: boolean;
  activity: SellerFinancialActivityRow;
};

function sumInRange(rows: { amount: number; at: Date }[], start: Date, end: Date): number {
  const a = start.getTime();
  const b = end.getTime();
  let total = 0;
  for (const row of rows) {
    const t = row.at.getTime();
    if (t >= a && t < b) total += row.amount;
  }
  return money(total);
}

/**
 * Full seller earnings overview — GMV, estimated/actual nets, fees, and payout buckets.
 * Nets match Sales order math (platform fee + reserve + label + Stripe processing).
 */
export async function buildSellerFinancialsSummary(
  sellerId: string,
  timeZone: string,
  now = new Date(),
): Promise<SellerFinancialsSummary> {
  const day = calendarDayInTimeZone(now, timeZone);
  const { start: todayStart, end: todayEnd } = calendarDayBoundsUtc(day, timeZone);
  const { start: monthStart, end: monthEnd } = monthBoundsUtc(day, timeZone);

  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      payoutTier: true,
      ...sellerPlatformFeeOverrideSelect,
      payoutMetrics: { select: { lifetimeGmvUsd: true } },
    },
  });
  const sellerUser = user ? sellerUserWithEffectivePlatformFeeOverride(user) : null;

  // Warm admin fee caches so reconstruction fallback matches charge-time config (not cold 8%/7.25% defaults).
  await Promise.all([ensureLiveShowFeeCache(true), ensureMarketplacePlatformFeeCache(true)]);

  const orders = await prisma.order.findMany({
    where: {
      sellerId,
      OR: [
        { paymentStatus: { in: ["paid", "layaway_completed"] } },
        { status: { in: ["paid", "shipped", "completed"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true,
      totalUsd: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      paymentStatus: true,
      payoutStatus: true,
      payoutReserveAmountCents: true,
      shippingChargedCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
      stripeProcessingFeeCents: true,
      carrier: true,
      service: true,
      trackingNumber: true,
      labelUrl: true,
      shippoTransactionId: true,
      labelCreatedAt: true,
      createdAt: true,
      listing: { select: { title: true, isCompanyListing: true } },
      buyer: { select: { username: true } },
      labelFinances: {
        select: {
          id: true,
          orderId: true,
          shippoTransactionId: true,
          shippoShipmentId: true,
          labelCostCents: true,
          purpose: true,
          replacesShippoTransactionId: true,
          status: true,
          sellerClawbackCents: true,
          sellerClawbackReversalId: true,
          sellerCreditCents: true,
          sellerCreditTransferId: true,
          clawbackIdempotencyKey: true,
          creditIdempotencyKey: true,
        },
      },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: {
              title: true,
              completedSalesGmvUsd: true,
              finalSalesGmvUsd: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const sales: ComputedSale[] = [];
  let estimateFeeCount = 0;

  for (const o of orders) {
    const liveShowId = o.liveShippingSession?.liveShowId ?? null;
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const channel: "marketplace" | "live" = liveShowId ? "live" : "marketplace";
    const gmvUsd = money(o.itemPriceUsd);
    const shippingUsd = money(o.shippingPriceUsd);
    const taxUsd = money(Math.max(o.taxUsd ?? 0, (o.taxAmountCents ?? 0) / 100));

    // Get Vaulted fee = persisted platform fee only. Never stripeApplicationFeeCents (may include processing).
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: o.itemPriceUsd,
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      platformFeeCents: o.platformFeeCents,
      platformFeePercentApplied: o.platformFeePercentApplied,
      platformFeeBasisCents: o.platformFeeBasisCents,
      liveShowId,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
      orderPaymentStatus: o.paymentStatus,
      sellerPlatformFeePercentOverride: sellerUser?.sellerPlatformFeePercentOverride,
    });
    const platformFeeUsd = money(fee.platformFeeUsd);
    const platformFeePercent = money(fee.platformFeePercent);

    const processingFeeActual = centsToUsd(o.stripeProcessingFeeCents);
    const processingFeeEstimate = estimateStripeProcessingFeeUsd(o.totalUsd);
    const processingFeeUsd = processingFeeActual ?? processingFeeEstimate;
    const feesAreEstimates = fee.source === "reconstructed" || processingFeeActual == null;
    if (feesAreEstimates) estimateFeeCount += 1;

    const shippingBreakdown = resolveSellerShippingBreakdown({
      shippingChargedCents: o.shippingChargedCents,
      shippingPriceUsd: o.shippingPriceUsd,
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      carrier: o.carrier,
      service: o.service,
      trackingNumber: o.trackingNumber,
      labelCreatedAt: o.labelCreatedAt,
      labelUrl: o.labelUrl,
      shippoTransactionId: o.shippoTransactionId,
      labelFinances: o.labelFinances,
    });
    const labelCostUsd = money((shippingBreakdown.actualLabelCostCents ?? 0) / 100);
    const reserveUsd = money(Math.max(0, o.payoutReserveAmountCents) / 100);

    const netUsd = money(
      estimateSellerOrderPayoutUsd({
        itemPriceUsd: o.itemPriceUsd,
        shippingPriceUsd: o.shippingPriceUsd,
        payoutReserveAmountCents: o.payoutReserveAmountCents,
        platformFeePercent,
        shippingLabelCostCents: o.shippingLabelCostCents,
        shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
        stripeProcessingFeeUsd: processingFeeUsd,
      }),
    );

    const at = o.createdAt;
    sales.push({
      at,
      channel,
      gmvUsd,
      netUsd,
      platformFeeUsd,
      processingFeeUsd,
      labelCostUsd,
      payoutStatus: o.payoutStatus,
      feesAreEstimates,
      activity: {
        id: o.id,
        title: o.listing.title?.trim() || "Sale",
        buyerUsername: o.buyer.username?.trim() || "buyer",
        channel,
        liveShowTitle: liveShow?.title?.trim() || null,
        itemPriceUsd: gmvUsd,
        shippingPriceUsd: shippingUsd,
        taxUsd,
        platformFeeUsd,
        platformFeePercent,
        stripeProcessingFeeUsd: processingFeeUsd,
        labelCostUsd,
        reserveUsd,
        sellerNetUsd: netUsd,
        feesAreEstimates,
        payoutStatus: o.payoutStatus,
        payoutStatusLabel: payoutStatusLabel(o.payoutStatus),
        occurredAt: at.toISOString(),
        href: `/account/sales/${encodeURIComponent(o.id)}`,
      },
    });
  }

  const lifetimeGmvUsd = money(sales.reduce((s, r) => s + r.gmvUsd, 0));
  const lifetimeEarningsUsd = money(sales.reduce((s, r) => s + r.netUsd, 0));
  const monthGmvUsd = sumInRange(
    sales.map((r) => ({ amount: r.gmvUsd, at: r.at })),
    monthStart,
    monthEnd,
  );
  const monthEarningsUsd = sumInRange(
    sales.map((r) => ({ amount: r.netUsd, at: r.at })),
    monthStart,
    monthEnd,
  );
  const todayGmvUsd = sumInRange(
    sales.map((r) => ({ amount: r.gmvUsd, at: r.at })),
    todayStart,
    todayEnd,
  );
  const todayEarningsUsd = sumInRange(
    sales.map((r) => ({ amount: r.netUsd, at: r.at })),
    todayStart,
    todayEnd,
  );

  const marketplaceEarningsUsd = money(
    sales.filter((r) => r.channel === "marketplace").reduce((s, r) => s + r.netUsd, 0),
  );
  const liveEarningsUsd = money(
    sales.filter((r) => r.channel === "live").reduce((s, r) => s + r.netUsd, 0),
  );

  let paidOutUsd = 0;
  let pendingPayoutUsd = 0;
  let heldOrBlockedUsd = 0;
  const bucketMap = new Map<string, SellerPayoutStatusBucket>();

  for (const r of sales) {
    const existing = bucketMap.get(r.payoutStatus);
    if (existing) {
      existing.orderCount += 1;
      existing.sellerNetUsd = money(existing.sellerNetUsd + r.netUsd);
    } else {
      bucketMap.set(r.payoutStatus, {
        status: r.payoutStatus,
        label: payoutStatusLabel(r.payoutStatus),
        orderCount: 1,
        sellerNetUsd: r.netUsd,
      });
    }

    if (r.payoutStatus === "paid_out") {
      paidOutUsd += r.netUsd;
    } else if (r.payoutStatus === "blocked" || r.payoutStatus === "manual_review" || r.payoutStatus === "held") {
      heldOrBlockedUsd += r.netUsd;
    } else {
      pendingPayoutUsd += r.netUsd;
    }
  }

  const payoutStatusBreakdown = Array.from(bucketMap.values()).sort(
    (a, b) => b.sellerNetUsd - a.sellerNetUsd,
  );

  const tier = user?.payoutTier ?? null;
  const tierLabel =
    tier === "instant"
      ? "Instant"
      : tier === "fast"
        ? "Fast"
        : tier === "standard"
          ? "Standard"
          : tier;

  return {
    timeZone,
    day,
    monthLabel: monthLabel(day, timeZone),
    lifetimeGmvUsd,
    monthGmvUsd,
    todayGmvUsd,
    lifetimeEarningsUsd,
    monthEarningsUsd,
    todayEarningsUsd,
    marketplaceEarningsUsd,
    liveEarningsUsd,
    paidOutUsd: money(paidOutUsd),
    pendingPayoutUsd: money(pendingPayoutUsd),
    heldOrBlockedUsd: money(heldOrBlockedUsd),
    platformFeesUsd: money(sales.reduce((s, r) => s + r.platformFeeUsd, 0)),
    stripeProcessingFeesUsd: money(sales.reduce((s, r) => s + r.processingFeeUsd, 0)),
    labelCostsUsd: money(sales.reduce((s, r) => s + r.labelCostUsd, 0)),
    paidOrderCount: sales.length,
    feesAreMostlyEstimates: sales.length > 0 ? estimateFeeCount / sales.length >= 0.5 : true,
    payoutStatusBreakdown,
    payoutTier: tier,
    payoutTierLabel: tierLabel,
    metricsLifetimeGmvUsd: user?.payoutMetrics?.lifetimeGmvUsd ?? null,
    activity: sales.map((r) => r.activity).slice(0, 60),
  };
}
