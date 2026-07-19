import { prisma } from "@/lib/prisma";
import {
  buildLiveShowFeeTierSnapshot,
  type LiveShowFeeTierSnapshot,
} from "@/lib/platform-fee-policy";
import { liveShowFulfillmentOrderIds } from "@/lib/live-show-fulfillment-order-ids";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { roundUsd } from "@/lib/round-usd";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import {
  PAYMENT_CHARGEBACK,
  PAYMENT_PAID,
  PAYMENT_REFUNDED,
} from "@/services/payments";

/** One unique merchandise sale that counts toward show GMV (item subtotal only). */
export type LiveShowSaleContribution = {
  /** Stable unique key — prevents double-count across order/spot/variant rows. */
  id: string;
  itemSubtotalUsd: number;
  /** True when the paid sale was later refunded/chargebacked. */
  refunded: boolean;
};

export type LiveShowSellerSummaryDTO = {
  showId: string;
  status: string;
  currency: "usd";
  /** Visible live counter — completed paid item subtotals; does not drop on refund. */
  grossShowSalesCents: number;
  refundedShowSalesCents: number;
  netShowSalesCents: number;
  paidOrderCount: number;
  /** Fee-tier GMV used at charge time (LiveRoom counter; net of mid-show refunds). */
  feeTierGmvCents: number;
  currentFeeRateBps: number;
  currentFeeRatePercent: number;
  nextTierRateBps: number | null;
  nextTierThresholdCents: number | null;
  amountUntilNextTierCents: number | null;
  tierProgressPercent: number;
  feeTier: LiveShowFeeTierSnapshot;
  calculatedAt: string;
};

export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 100);
}

export function centsToUsd(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return roundUsd(cents / 100);
}

export function feePercentToBps(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(percent * 100);
}

const GROSS_PAYMENT_STATUSES = new Set([PAYMENT_PAID, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK]);

export function isGrossCountablePaymentStatus(status: string | null | undefined): boolean {
  return GROSS_PAYMENT_STATUSES.has(String(status ?? ""));
}

export function isRefundedPaymentStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "");
  return s === PAYMENT_REFUNDED || s === PAYMENT_CHARGEBACK;
}

/**
 * Aggregate unique paid show sales into gross / refunded / net cents.
 * Duplicate ids are ignored (idempotent under webhook retries).
 */
export function aggregateShowSaleContributions(rows: LiveShowSaleContribution[]): {
  grossShowSalesCents: number;
  refundedShowSalesCents: number;
  netShowSalesCents: number;
  paidOrderCount: number;
} {
  const seen = new Set<string>();
  let grossShowSalesCents = 0;
  let refundedShowSalesCents = 0;
  let paidOrderCount = 0;

  for (const row of rows) {
    const id = row.id.trim();
    if (!id || seen.has(id)) continue;
    const cents = usdToCents(row.itemSubtotalUsd);
    if (cents <= 0) continue;
    seen.add(id);
    paidOrderCount += 1;
    grossShowSalesCents += cents;
    if (row.refunded) refundedShowSalesCents += cents;
  }

  return {
    grossShowSalesCents,
    refundedShowSalesCents,
    netShowSalesCents: Math.max(0, grossShowSalesCents - refundedShowSalesCents),
    paidOrderCount,
  };
}

export function tierProgressPercent(completedGmvUsd: number, nextTierThresholdUsd: number | null): number {
  if (nextTierThresholdUsd == null || nextTierThresholdUsd <= 0) return 100;
  return Math.min(100, Math.max(0, (Math.max(0, completedGmvUsd) / nextTierThresholdUsd) * 100));
}

export function buildLiveShowSellerSummaryDTO(args: {
  showId: string;
  status: string;
  contributions: LiveShowSaleContribution[];
  /** Authoritative fee-tier GMV (LiveRoom completed/final); do not change fee business rule. */
  feeTierGmvUsd: number;
  calculatedAt?: Date;
}): LiveShowSellerSummaryDTO {
  const totals = aggregateShowSaleContributions(args.contributions);
  const feeTier = buildLiveShowFeeTierSnapshot(Math.max(0, args.feeTierGmvUsd));
  const amountUntilNextTierCents =
    feeTier.usdToNextTier != null ? usdToCents(feeTier.usdToNextTier) : null;

  return {
    showId: args.showId,
    status: args.status,
    currency: "usd",
    ...totals,
    feeTierGmvCents: usdToCents(args.feeTierGmvUsd),
    currentFeeRateBps: feePercentToBps(feeTier.currentFeePercent),
    currentFeeRatePercent: feeTier.currentFeePercent,
    nextTierRateBps: feeTier.nextTierFeePercent != null ? feePercentToBps(feeTier.nextTierFeePercent) : null,
    nextTierThresholdCents:
      feeTier.nextTierThresholdUsd != null ? usdToCents(feeTier.nextTierThresholdUsd) : null,
    amountUntilNextTierCents,
    tierProgressPercent: tierProgressPercent(feeTier.completedGmvUsd, feeTier.nextTierThresholdUsd),
    feeTier,
    calculatedAt: (args.calculatedAt ?? new Date()).toISOString(),
  };
}

type OrderSaleRow = {
  id: string;
  itemPriceUsd: number;
  paymentStatus: string;
  paymentLabel: string | null;
};

function contributionFromOrder(o: OrderSaleRow): LiveShowSaleContribution | null {
  if (o.paymentLabel === "giveaway") return null;
  if (!isGrossCountablePaymentStatus(o.paymentStatus)) return null;
  const itemSubtotalUsd = roundUsd(o.itemPriceUsd);
  if (itemSubtotalUsd <= 0) return null;
  return {
    id: `order:${o.id}`,
    itemSubtotalUsd,
    refunded: isRefundedPaymentStatus(o.paymentStatus),
  };
}

/**
 * Collect unique paid merchandise sales for a live show (item subtotals only).
 * Dedupes fulfillment orders shared by break spots / variant purchases.
 */
export async function collectLiveShowSaleContributions(
  liveRoomId: string,
  sellerId: string,
): Promise<LiveShowSaleContribution[]> {
  const listingRows = await prisma.liveRoomItem.findMany({
    where: { liveRoomId, listingId: { not: null } },
    select: { listingId: true },
  });
  const listingIds = [...new Set(listingRows.map((r) => r.listingId).filter((x): x is string => Boolean(x)))];
  const fulfillmentOrderIds = await liveShowFulfillmentOrderIds(liveRoomId);

  const [ordersBySession, ordersByFulfillment, spots, variantPurchases] = await Promise.all([
    prisma.order.findMany({
      where: {
        sellerId,
        liveShippingSession: { is: { liveShowId: liveRoomId } },
        paymentStatus: { in: [...GROSS_PAYMENT_STATUSES] },
      },
      select: { id: true, itemPriceUsd: true, paymentStatus: true, paymentLabel: true },
    }),
    fulfillmentOrderIds.length
      ? prisma.order.findMany({
          where: {
            sellerId,
            id: { in: fulfillmentOrderIds },
            paymentStatus: { in: [...GROSS_PAYMENT_STATUSES] },
          },
          select: { id: true, itemPriceUsd: true, paymentStatus: true, paymentLabel: true },
        })
      : Promise.resolve([] as OrderSaleRow[]),
    prisma.breakSpot.findMany({
      where: {
        liveRoomId,
        OR: [
          { breakPaymentStatus: { in: [PAYMENT_PAID, "paid"] } },
          { paidAt: { not: null } },
        ],
      },
      select: {
        id: true,
        priceUsd: true,
        fulfillmentOrderId: true,
        breakPaymentStatus: true,
        paidAt: true,
      },
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: { liveRoomId, paymentStatus: "paid" },
      select: {
        id: true,
        totalUsd: true,
        unitPriceUsd: true,
        quantity: true,
        fulfillmentOrderId: true,
        paymentStatus: true,
      },
    }),
  ]);

  // Listing-tied orders are only included when they also have a live shipping session for this
  // show (queried above) or are fulfillment orders. Do not pull marketplace listing history.
  void listingIds;

  const orderById = new Map<string, OrderSaleRow>();
  for (const o of [...ordersBySession, ...ordersByFulfillment]) {
    if (!orderById.has(o.id)) orderById.set(o.id, o);
  }

  const contributions: LiveShowSaleContribution[] = [];
  const coveredOrderIds = new Set<string>();

  for (const o of orderById.values()) {
    const c = contributionFromOrder(o);
    if (!c) continue;
    contributions.push(c);
    coveredOrderIds.add(o.id);
  }

  for (const s of spots) {
    const fulfillmentId = s.fulfillmentOrderId?.trim() || "";
    if (fulfillmentId && coveredOrderIds.has(fulfillmentId)) continue;
    const paid =
      s.breakPaymentStatus === PAYMENT_PAID ||
      s.breakPaymentStatus === "paid" ||
      s.paidAt != null;
    if (!paid) continue;
    const itemSubtotalUsd = roundUsd(s.priceUsd);
    if (itemSubtotalUsd <= 0) continue;
    if (fulfillmentId) {
      // Order missing from DB query (edge) — still count once via spot.
      coveredOrderIds.add(fulfillmentId);
      contributions.push({
        id: `order:${fulfillmentId}`,
        itemSubtotalUsd,
        refunded: false,
      });
      continue;
    }
    contributions.push({
      id: `break_spot:${s.id}`,
      itemSubtotalUsd,
      refunded: false,
    });
  }

  for (const vp of variantPurchases) {
    const fulfillmentId = vp.fulfillmentOrderId?.trim() || "";
    if (fulfillmentId && coveredOrderIds.has(fulfillmentId)) continue;
    const itemSubtotalUsd = roundUsd(
      Number.isFinite(vp.totalUsd) && vp.totalUsd > 0
        ? vp.totalUsd
        : vp.unitPriceUsd * vp.quantity,
    );
    if (itemSubtotalUsd <= 0) continue;
    if (fulfillmentId) {
      coveredOrderIds.add(fulfillmentId);
      contributions.push({
        id: `order:${fulfillmentId}`,
        itemSubtotalUsd,
        refunded: false,
      });
      continue;
    }
    contributions.push({
      id: `variant_purchase:${vp.id}`,
      itemSubtotalUsd,
      refunded: false,
    });
  }

  return contributions;
}

export function logSellerShowSummaryEvent(
  event:
    | "seller_show_summary_fetch"
    | "seller_show_summary_loaded"
    | "seller_show_paid_order_event"
    | "seller_show_sales_changed"
    | "seller_show_fee_tier_changed"
    | "seller_show_summary_reconnect_refresh"
    | "seller_show_summary_inconsistent",
  payload: Record<string, unknown>,
): void {
  console.info(`[${event}]`, payload);
}

/**
 * Authoritative seller financial summary for a live show.
 * SHOW SALES uses order aggregation (gross). Fee tier uses LiveRoom GMV (per-sale rule).
 */
export async function fetchLiveShowSellerSummary(liveRoomId: string): Promise<LiveShowSellerSummaryDTO | null> {
  logSellerShowSummaryEvent("seller_show_summary_fetch", { showId: liveRoomId });
  await ensureLiveShowFeeCache(true);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      completedSalesGmvUsd: true,
      finalSalesGmvUsd: true,
    },
  });
  if (!room) return null;

  const contributions = await collectLiveShowSaleContributions(liveRoomId, room.sellerId);
  const feeTierGmvUsd = liveShowGmvForFeeTierReconstruction(room) ?? 0;
  const totals = aggregateShowSaleContributions(contributions);

  // Historical safety: if order linkage is incomplete after a show ends, prefer the
  // persisted final GMV snapshot over a false $0.00 show-sales total.
  let effectiveContributions = contributions;
  if (
    room.status !== "live" &&
    totals.grossShowSalesCents === 0 &&
    (room.finalSalesGmvUsd ?? 0) > 0
  ) {
    effectiveContributions = [
      {
        id: `final_gmv_snapshot:${room.id}`,
        itemSubtotalUsd: room.finalSalesGmvUsd ?? 0,
        refunded: false,
      },
    ];
    logSellerShowSummaryEvent("seller_show_summary_inconsistent", {
      showId: liveRoomId,
      reason: "ended_show_order_aggregate_empty_using_final_gmv_snapshot",
      newSalesCents: usdToCents(room.finalSalesGmvUsd ?? 0),
      paidOrderCount: 0,
      currentTier: null,
      nextTier: null,
    });
  }

  const summary = buildLiveShowSellerSummaryDTO({
    showId: room.id,
    status: room.status,
    contributions: effectiveContributions,
    feeTierGmvUsd,
  });

  const feeNetDriftCents = Math.abs(summary.netShowSalesCents - summary.feeTierGmvCents);
  if (feeNetDriftCents > 1) {
    logSellerShowSummaryEvent("seller_show_summary_inconsistent", {
      showId: liveRoomId,
      reason: "net_order_gmv_vs_fee_tier_gmv",
      netShowSalesCents: summary.netShowSalesCents,
      feeTierGmvCents: summary.feeTierGmvCents,
      paidOrderCount: summary.paidOrderCount,
      currentTier: summary.currentFeeRatePercent,
      nextTier: summary.feeTier.nextTierFeePercent,
    });
  }

  logSellerShowSummaryEvent("seller_show_summary_loaded", {
    showId: liveRoomId,
    previousSalesCents: null,
    newSalesCents: summary.grossShowSalesCents,
    paidOrderCount: summary.paidOrderCount,
    currentTier: summary.currentFeeRatePercent,
    nextTier: summary.feeTier.nextTierFeePercent,
  });

  return summary;
}
