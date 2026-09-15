import { applicationFeeCentsFromSubtotalUsd } from "@/lib/platform-fee-policy";
import { resolvePlatformFeePercentForSellerOrder } from "@/lib/seller-payout-estimate";

export const OFF_PLATFORM_SETTLEMENT_METHODS = [
  "venmo",
  "paypal",
  "cash_app",
  "cash",
  "zelle",
  "other",
] as const;

export type OffPlatformSettlementMethodId = (typeof OFF_PLATFORM_SETTLEMENT_METHODS)[number];

export const OFF_PLATFORM_ZERO_REASONS = ["giveaway", "comp", "mistake", "other"] as const;
export type OffPlatformZeroReasonId = (typeof OFF_PLATFORM_ZERO_REASONS)[number];

export function parseOffPlatformSettlementMethod(raw: unknown): OffPlatformSettlementMethodId | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return (OFF_PLATFORM_SETTLEMENT_METHODS as readonly string[]).includes(v)
    ? (v as OffPlatformSettlementMethodId)
    : null;
}

export function parseOffPlatformZeroReason(raw: unknown): OffPlatformZeroReasonId | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return (OFF_PLATFORM_ZERO_REASONS as readonly string[]).includes(v)
    ? (v as OffPlatformZeroReasonId)
    : null;
}

export function offPlatformMethodLabel(method: OffPlatformSettlementMethodId | string | null | undefined): string {
  switch (method) {
    case "venmo":
      return "Venmo";
    case "paypal":
      return "PayPal";
    case "cash_app":
      return "Cash App";
    case "cash":
      return "Cash";
    case "zelle":
      return "Zelle";
    case "other":
      return "Other";
    default:
      return "Off-platform";
  }
}

export function offPlatformZeroReasonLabel(reason: OffPlatformZeroReasonId | string | null | undefined): string {
  switch (reason) {
    case "giveaway":
      return "Giveaway";
    case "comp":
      return "Comp";
    case "mistake":
      return "Mistake / fix";
    case "other":
      return "Other";
    default:
      return "Free";
  }
}

/** Round money to cents as USD. */
export function normalizeOffPlatformSaleAmountUsd(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw * 100) / 100;
}

export function computeOffPlatformPlatformFee(args: {
  saleAmountUsd: number;
  liveShowId: string;
  liveShowCompletedGmvUsd: number | null;
  sellerPlatformFeePercentOverride?: number | null;
}): { feePercent: number; feeCents: number; feeStatus: "unpaid" | "waived" } {
  const sale = Math.max(0, args.saleAmountUsd);
  if (sale < 0.01) {
    return { feePercent: 0, feeCents: 0, feeStatus: "waived" };
  }
  const feePercent = resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: false,
    liveShowId: args.liveShowId,
    liveShowCompletedGmvUsd: args.liveShowCompletedGmvUsd,
    orderItemPriceUsd: sale,
    orderPaymentStatus: "paid",
    sellerPlatformFeePercentOverride: args.sellerPlatformFeePercentOverride,
  });
  const feeCents = applicationFeeCentsFromSubtotalUsd(sale, feePercent);
  if (feeCents <= 0) {
    return { feePercent, feeCents: 0, feeStatus: "waived" };
  }
  return { feePercent, feeCents, feeStatus: "unpaid" };
}
