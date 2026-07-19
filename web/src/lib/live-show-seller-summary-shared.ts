/**
 * Client-safe show-sales helpers/types (no Prisma / Node builtins).
 * Server aggregation lives in `live-show-seller-summary.ts`.
 */
import {
  buildLiveShowFeeTierSnapshot,
  type LiveShowFeeTierSnapshot,
} from "@/lib/platform-fee-policy";
import { roundUsd } from "@/lib/round-usd";

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

/** Mirror of payment status strings — avoid importing `@/services/payments` on the client. */
export const SHOW_SALE_PAYMENT_PAID = "paid";
export const SHOW_SALE_PAYMENT_REFUNDED = "refunded";
export const SHOW_SALE_PAYMENT_CHARGEBACK = "chargeback";

const GROSS_PAYMENT_STATUSES = new Set([
  SHOW_SALE_PAYMENT_PAID,
  SHOW_SALE_PAYMENT_REFUNDED,
  SHOW_SALE_PAYMENT_CHARGEBACK,
]);

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

export function isGrossCountablePaymentStatus(status: string | null | undefined): boolean {
  return GROSS_PAYMENT_STATUSES.has(String(status ?? ""));
}

export function isRefundedPaymentStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "");
  return s === SHOW_SALE_PAYMENT_REFUNDED || s === SHOW_SALE_PAYMENT_CHARGEBACK;
}

export function grossCountablePaymentStatuses(): string[] {
  return [...GROSS_PAYMENT_STATUSES];
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
