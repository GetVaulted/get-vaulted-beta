import { prisma } from "@/lib/prisma";
import { liveShowFulfillmentOrderIds } from "@/lib/live-show-fulfillment-order-ids";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { buildLiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import {
  loadOrderChargeTotalsById,
  orderChargeUsdFromFields,
  resolveChargeUsdFromFulfillmentOrderMap,
} from "@/lib/live-purchase-charge-total";
import {
  aggregateShowSaleContributions,
  feePercentToBps,
  grossCountablePaymentStatuses,
  isGrossCountablePaymentStatus,
  isRefundedPaymentStatus,
  logSellerShowSummaryEvent,
  SHOW_SALE_PAYMENT_PAID,
  tierProgressPercent,
  usdToCents,
  type LiveShowSaleContribution,
  type LiveShowSellerSummaryDTO,
} from "@/lib/live-show-seller-summary-shared";

export type { LiveShowSaleContribution, LiveShowSellerSummaryDTO };
export {
  aggregateShowSaleContributions,
  centsToUsd,
  feePercentToBps,
  isGrossCountablePaymentStatus,
  isRefundedPaymentStatus,
  logSellerShowSummaryEvent,
  tierProgressPercent,
  usdToCents,
} from "@/lib/live-show-seller-summary-shared";

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
  shippingPriceUsd: number;
  taxUsd: number;
  taxAmountCents: number;
  totalUsd: number;
  paymentStatus: string;
  paymentLabel: string | null;
};

function contributionFromOrder(o: OrderSaleRow): LiveShowSaleContribution | null {
  if (o.paymentLabel === "giveaway") return null;
  if (!isGrossCountablePaymentStatus(o.paymentStatus)) return null;
  // Seller-facing show sales = what the buyer paid (item + shipping + tax).
  // Fee-tier GMV stays on merchandise via `feeTierGmvUsd` separately.
  const itemSubtotalUsd = orderChargeUsdFromFields(o);
  if (itemSubtotalUsd <= 0) return null;
  return {
    id: `order:${o.id}`,
    itemSubtotalUsd,
    refunded: isRefundedPaymentStatus(o.paymentStatus),
  };
}

/**
 * Collect unique paid sales for a live show (buyer charge totals: item + shipping + tax).
 * Dedupes fulfillment orders shared by break spots / variant purchases.
 * Fee tiers continue to use merchandise GMV from the LiveRoom counter, not this list.
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
  const grossStatuses = grossCountablePaymentStatuses();
  const orderSelect = {
    id: true,
    itemPriceUsd: true,
    shippingPriceUsd: true,
    taxUsd: true,
    taxAmountCents: true,
    totalUsd: true,
    paymentStatus: true,
    paymentLabel: true,
  } as const;

  const [ordersBySession, ordersByFulfillment, spots, variantPurchases] = await Promise.all([
    prisma.order.findMany({
      where: {
        sellerId,
        liveShippingSession: { is: { liveShowId: liveRoomId } },
        paymentStatus: { in: grossStatuses },
      },
      select: orderSelect,
    }),
    fulfillmentOrderIds.length
      ? prisma.order.findMany({
          where: {
            sellerId,
            id: { in: fulfillmentOrderIds },
            paymentStatus: { in: grossStatuses },
          },
          select: orderSelect,
        })
      : Promise.resolve([] as OrderSaleRow[]),
    prisma.breakSpot.findMany({
      where: {
        liveRoomId,
        OR: [
          { breakPaymentStatus: { in: [SHOW_SALE_PAYMENT_PAID, "paid"] } },
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

  const orphanFulfillmentIds = [
    ...new Set(
      [...spots, ...variantPurchases]
        .map((r) => r.fulfillmentOrderId?.trim() || "")
        .filter((id) => id && !orderById.has(id)),
    ),
  ];
  const orphanChargeById =
    orphanFulfillmentIds.length > 0 ? await loadOrderChargeTotalsById(orphanFulfillmentIds) : new Map<string, number>();

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
      s.breakPaymentStatus === SHOW_SALE_PAYMENT_PAID ||
      s.breakPaymentStatus === "paid" ||
      s.paidAt != null;
    if (!paid) continue;
    const itemSubtotalUsd = resolveChargeUsdFromFulfillmentOrderMap(
      s.priceUsd,
      fulfillmentId || null,
      orphanChargeById,
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
      id: `break_spot:${s.id}`,
      itemSubtotalUsd,
      refunded: false,
    });
  }

  for (const vp of variantPurchases) {
    const fulfillmentId = vp.fulfillmentOrderId?.trim() || "";
    if (fulfillmentId && coveredOrderIds.has(fulfillmentId)) continue;
    const fallbackUsd =
      Number.isFinite(vp.totalUsd) && vp.totalUsd > 0 ? vp.totalUsd : vp.unitPriceUsd * vp.quantity;
    const itemSubtotalUsd = resolveChargeUsdFromFulfillmentOrderMap(
      fallbackUsd,
      fulfillmentId || null,
      orphanChargeById,
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
