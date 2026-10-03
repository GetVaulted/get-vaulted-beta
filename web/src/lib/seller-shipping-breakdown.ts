import { isLabelCostChargeable, summarizeLabelFinanceRows, type LabelFinanceRow } from "@/services/shipping/label-finance";

export type SellerLabelStatus = "quoted" | "purchased" | "pending" | "failed" | "refunded" | "voided";

export type SellerShippingBreakdown = {
  buyerShippingCollectedCents: number;
  /** Null when label not yet purchased successfully — UI shows "Pending". */
  actualLabelCostCents: number | null;
  labelRefundOrCreditCents: number;
  netShippingImpactCents: number;
  labelStatus: SellerLabelStatus;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  purchasedAt: string | null;
  /** True when actualLabelCostCents came from ShipmentLabelFinance chargeable rows. */
  labelCostSource: "label_finance" | "order_shipping_label_cost" | "none";
};

function resolveBuyerShippingCollectedCents(args: {
  shippingChargedCents?: number | null;
  shippingPriceUsd?: number | null;
}): number {
  if (args.shippingChargedCents != null && Number.isFinite(args.shippingChargedCents)) {
    return Math.max(0, Math.floor(args.shippingChargedCents));
  }
  const usd = args.shippingPriceUsd ?? 0;
  return Math.max(0, Math.round(Math.max(0, usd) * 100));
}

/**
 * Seller shipping economics: buyer-paid shipping vs actual purchased label cost.
 * Priority: ShipmentLabelFinance (chargeable) → Order.shippingLabelCostCents (legacy success) → pending.
 * Never treats quoted rates as actual paid cost.
 */
export function resolveSellerShippingBreakdown(args: {
  shippingChargedCents?: number | null;
  shippingPriceUsd?: number | null;
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
  carrier?: string | null;
  service?: string | null;
  trackingNumber?: string | null;
  labelCreatedAt?: Date | string | null;
  labelUrl?: string | null;
  shippoTransactionId?: string | null;
  labelFinances?: LabelFinanceRow[] | null;
}): SellerShippingBreakdown {
  const buyerShippingCollectedCents = resolveBuyerShippingCollectedCents(args);
  const rows = args.labelFinances ?? [];

  if (rows.length > 0) {
    const summary = summarizeLabelFinanceRows(rows);
    const failedOnly =
      rows.length > 0 && rows.every((r) => r.status === "failed_purchase");
    const allRefundedOrVoided =
      rows.length > 0 &&
      rows.every((r) => r.status === "refunded" || r.status === "voided" || r.status === "failed_purchase") &&
      !failedOnly &&
      summary.chargeableLabelCostCents === 0;
    const hasPurchased = summary.chargeableLabelCostCents > 0;
    const hasPendingRefund = summary.hasRefundPending;

    let labelStatus: SellerLabelStatus = "pending";
    let actualLabelCostCents: number | null = null;

    if (failedOnly) {
      labelStatus = "failed";
      actualLabelCostCents = 0;
    } else if (hasPurchased) {
      labelStatus = hasPendingRefund ? "purchased" : "purchased";
      actualLabelCostCents = summary.chargeableLabelCostCents;
    } else if (allRefundedOrVoided) {
      const refunded = rows.some((r) => r.status === "refunded");
      labelStatus = refunded ? "refunded" : "voided";
      // Show original purchased cost from clawed rows when available.
      const original = rows.reduce((s, r) => {
        if (r.status === "refunded" || r.status === "voided") {
          return s + Math.max(0, r.labelCostCents > 0 ? r.labelCostCents : r.sellerClawbackCents);
        }
        return s;
      }, 0);
      actualLabelCostCents = original > 0 ? original : 0;
    } else if (args.labelUrl || args.shippoTransactionId) {
      labelStatus = "quoted";
      actualLabelCostCents = null;
    }

    const labelRefundOrCreditCents = summary.sellerCreditCents;
    const netShippingImpactCents =
      buyerShippingCollectedCents -
      (actualLabelCostCents ?? 0) +
      labelRefundOrCreditCents;

    return {
      buyerShippingCollectedCents,
      actualLabelCostCents,
      labelRefundOrCreditCents,
      netShippingImpactCents,
      labelStatus,
      carrier: args.carrier ?? null,
      service: args.service ?? null,
      trackingNumber: args.trackingNumber ?? null,
      purchasedAt: args.labelCreatedAt
        ? typeof args.labelCreatedAt === "string"
          ? args.labelCreatedAt
          : args.labelCreatedAt.toISOString()
        : null,
      labelCostSource: "label_finance",
    };
  }

  // Legacy Order.shippingLabelCostCents — only when a successful purchase is evidenced.
  const legacyCost =
    args.shippingLabelCostCents != null && Number.isFinite(args.shippingLabelCostCents)
      ? Math.max(0, Math.floor(args.shippingLabelCostCents))
      : null;
  const hasSuccessEvidence = Boolean(
    (args.labelUrl && args.labelUrl.trim()) ||
      (args.shippoTransactionId && args.shippoTransactionId.trim()) ||
      (args.trackingNumber && args.trackingNumber.trim()),
  );

  if (legacyCost != null && legacyCost > 0 && hasSuccessEvidence) {
    const credit = 0;
    return {
      buyerShippingCollectedCents,
      actualLabelCostCents: legacyCost,
      labelRefundOrCreditCents: credit,
      netShippingImpactCents: buyerShippingCollectedCents - legacyCost + credit,
      labelStatus: "purchased",
      carrier: args.carrier ?? null,
      service: args.service ?? null,
      trackingNumber: args.trackingNumber ?? null,
      purchasedAt: args.labelCreatedAt
        ? typeof args.labelCreatedAt === "string"
          ? args.labelCreatedAt
          : args.labelCreatedAt.toISOString()
        : null,
      labelCostSource: "order_shipping_label_cost",
    };
  }

  if (legacyCost === 0 && hasSuccessEvidence === false && args.shippoTransactionId) {
    // Failed purchase path may leave shippo tx id with zero chargeable cost.
    return {
      buyerShippingCollectedCents,
      actualLabelCostCents: 0,
      labelRefundOrCreditCents: 0,
      netShippingImpactCents: buyerShippingCollectedCents,
      labelStatus: "failed",
      carrier: args.carrier ?? null,
      service: args.service ?? null,
      trackingNumber: args.trackingNumber ?? null,
      purchasedAt: null,
      labelCostSource: "order_shipping_label_cost",
    };
  }

  return {
    buyerShippingCollectedCents,
    actualLabelCostCents: null,
    labelRefundOrCreditCents: 0,
    netShippingImpactCents: buyerShippingCollectedCents,
    labelStatus: hasSuccessEvidence ? "quoted" : "pending",
    carrier: args.carrier ?? null,
    service: args.service ?? null,
    trackingNumber: args.trackingNumber ?? null,
    purchasedAt: null,
    labelCostSource: "none",
  };
}

/** Show-level shipping totals from per-order breakdowns. */
export function aggregateSellerShippingBreakdowns(rows: SellerShippingBreakdown[]): {
  totalBuyerShippingCollectedCents: number;
  totalActualLabelCostCents: number;
  totalLabelRefundOrCreditCents: number;
  netShippingImpactCents: number;
  pendingLabelCount: number;
  failedLabelCount: number;
} {
  let totalBuyerShippingCollectedCents = 0;
  let totalActualLabelCostCents = 0;
  let totalLabelRefundOrCreditCents = 0;
  let pendingLabelCount = 0;
  let failedLabelCount = 0;

  for (const r of rows) {
    totalBuyerShippingCollectedCents += r.buyerShippingCollectedCents;
    if (r.actualLabelCostCents != null) totalActualLabelCostCents += r.actualLabelCostCents;
    totalLabelRefundOrCreditCents += r.labelRefundOrCreditCents;
    if (r.labelStatus === "pending" || r.labelStatus === "quoted") pendingLabelCount += 1;
    if (r.labelStatus === "failed") failedLabelCount += 1;
  }

  return {
    totalBuyerShippingCollectedCents,
    totalActualLabelCostCents,
    totalLabelRefundOrCreditCents,
    netShippingImpactCents:
      totalBuyerShippingCollectedCents - totalActualLabelCostCents + totalLabelRefundOrCreditCents,
    pendingLabelCount,
    failedLabelCount,
  };
}

export function chargeableLabelFinanceRows(rows: LabelFinanceRow[]): LabelFinanceRow[] {
  return rows.filter((r) => isLabelCostChargeable(r.status));
}
