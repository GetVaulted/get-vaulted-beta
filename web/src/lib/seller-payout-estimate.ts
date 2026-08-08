import { marketplacePlatformFeePercent } from "@/lib/platform-fee-policy";
import {
  completedLiveShowGmvBeforeSale,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";
import { clampPlatformFeePercent } from "@/lib/platform-fee-defaults";

/** Estimated seller net on an order (excludes tips; platform fee on item only). */
export function estimateSellerOrderPayoutUsd(args: {
  itemPriceUsd: number;
  payoutReserveAmountCents: number;
  platformFeePercent?: number;
  shippingPriceUsd?: number;
  /** Cumulative Get Vaulted label cost already deducted from seller (USD cents). */
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
  /**
   * Stripe processing fee the seller absorbs on this sale (2.9% + $0.30). Passed through to the
   * seller via the Connect charge, so it must be subtracted from the estimated payout when known.
   * Omitted callers keep the legacy behavior (no processing deduction).
   */
  stripeProcessingFeeUsd?: number;
}): number {
  const feePct = args.platformFeePercent ?? marketplacePlatformFeePercent();
  const item = Math.max(0, args.itemPriceUsd);
  const feeUsd = (item * feePct) / 100;
  const reserveUsd = Math.max(0, args.payoutReserveAmountCents) / 100;
  const shippingUsd = Math.max(0, args.shippingPriceUsd ?? 0);
  const reversedCents =
    args.shippingLabelCostReversedCents != null
      ? Math.max(0, args.shippingLabelCostReversedCents)
      : Math.max(0, args.shippingLabelCostCents ?? 0);
  const labelCostUsd = reversedCents / 100;
  const processingUsd = Math.max(0, args.stripeProcessingFeeUsd ?? 0);
  // Platform fee on item only; shipping pass-through; GV label cost deducted when purchased.
  // Stripe processing is passed to the seller on Connect, so deduct it when the caller supplies it.
  return Math.max(
    0,
    Math.round((item - feeUsd - reserveUsd + shippingUsd - labelCostUsd - processingUsd) * 100) / 100,
  );
}

const DEFAULT_STRIPE_PROCESSING_PERCENT = 2.9;
const DEFAULT_STRIPE_PROCESSING_FIXED_USD = 0.3;

function stripeProcessingFeePolicy(): { percent: number; fixedUsd: number } {
  const pctRaw = process.env.STRIPE_PROCESSING_FEE_PERCENT;
  const fixedRaw = process.env.STRIPE_PROCESSING_FEE_FIXED_USD;
  const pct = pctRaw != null ? Number(pctRaw) : DEFAULT_STRIPE_PROCESSING_PERCENT;
  const fixedUsd = fixedRaw != null ? Number(fixedRaw) : DEFAULT_STRIPE_PROCESSING_FIXED_USD;
  return {
    percent: Number.isFinite(pct) && pct >= 0 ? pct : DEFAULT_STRIPE_PROCESSING_PERCENT,
    fixedUsd: Number.isFinite(fixedUsd) && fixedUsd >= 0 ? fixedUsd : DEFAULT_STRIPE_PROCESSING_FIXED_USD,
  };
}

/** Estimated Stripe card processing fee on the buyer charge (2.9% + $0.30 by default). */
export function estimateStripeProcessingFeeUsd(chargeAmountUsd: number): number {
  const { percent, fixedUsd } = stripeProcessingFeePolicy();
  const charge = Math.max(0, chargeAmountUsd);
  return Math.max(0, Math.round((charge * (percent / 100) + fixedUsd) * 100) / 100);
}

/**
 * Estimated Stripe card processing fee in cents on the buyer charge (2.9% + $0.30 by default).
 * Used to pass the processing cost through to the seller on Connect destination charges so the
 * platform nets its full application fee. Same policy/env overrides as the USD variant.
 */
export function estimateStripeProcessingFeeCents(chargeAmountCents: number): number {
  const { percent, fixedUsd } = stripeProcessingFeePolicy();
  const cents = Math.max(0, Math.round(chargeAmountCents));
  if (cents <= 0) return 0;
  return Math.max(0, Math.round(cents * (percent / 100) + fixedUsd * 100));
}

export function estimatePlatformFeeUsd(args: {
  itemPriceUsd: number;
  platformFeePercent: number;
}): number {
  const item = Math.max(0, args.itemPriceUsd);
  const pct = Math.max(0, args.platformFeePercent);
  return Math.max(0, Math.round(((item * pct) / 100) * 100) / 100);
}

/**
 * Seller-absorbed Stripe processing fee for payout estimates — must match Connect transfer math.
 *
 * - Official/company listings: application fee is $0 and processing is NOT passed through to the
 *   seller (`processingFeeCents = 0` at charge time). Never invent a 2.9%+$0.30 haircut.
 * - Marketplace: prefer `Order.stripeProcessingFeeCents` when present; otherwise estimate from the
 *   buyer charge total (same policy as charge-time pass-through).
 */
export function resolveSellerAbsorbedProcessingFeeUsd(args: {
  isCompanyListing: boolean;
  stripeProcessingFeeCents?: number | null;
  buyerChargeTotalUsd: number;
}): number {
  if (args.isCompanyListing) {
    if (args.stripeProcessingFeeCents != null) {
      return Math.max(0, Math.round(args.stripeProcessingFeeCents) / 100);
    }
    return 0;
  }
  if (args.stripeProcessingFeeCents != null) {
    return Math.max(0, Math.round(args.stripeProcessingFeeCents) / 100);
  }
  return estimateStripeProcessingFeeUsd(args.buyerChargeTotalUsd);
}

export function resolvePlatformFeePercentForSellerOrder(args: {
  isCompanyListing: boolean;
  liveShowId: string | null;
  liveShowCompletedGmvUsd: number | null;
  orderItemPriceUsd: number;
  orderPaymentStatus: string;
  sellerPlatformFeePercentOverride?: number | null;
}): number {
  if (args.isCompanyListing) return 0;
  if (args.sellerPlatformFeePercentOverride != null) {
    return clampPlatformFeePercent(args.sellerPlatformFeePercentOverride);
  }
  if (!args.liveShowId) return marketplacePlatformFeePercent();
  const currentGmv = args.liveShowCompletedGmvUsd ?? 0;
  const gmvForTier =
    args.orderPaymentStatus === "paid"
      ? completedLiveShowGmvBeforeSale(currentGmv, args.orderItemPriceUsd)
      : currentGmv;
  return resolvePlatformFeePercentForCheckout({
    isCompanyListing: false,
    liveRoomId: args.liveShowId,
    completedLiveShowGmvUsd: gmvForTier,
  });
}

export function sellerInstantPayoutBannerMessage(args: {
  instantPayoutEligible: boolean;
  instantPayoutStatus: string;
  payoutTier?: string;
}): string {
  const tier = args.payoutTier ?? "standard";
  if (tier === "instant") {
    return "Instant Payout — funds become available immediately after you create a valid shipping label.";
  }
  if (tier === "fast") {
    return "Fast Payout — funds release when tracking shows the first carrier acceptance scan.";
  }
  const statusLabel = args.instantPayoutStatus.replace(/_/g, " ");
  if (args.instantPayoutStatus === "suspended") {
    return `Payout tier suspended. Standard release after delivery confirmation applies (${statusLabel}).`;
  }
  return "Standard Payout — funds release after delivery confirmation. Build your reputation to unlock Fast and Instant Payout tiers.";
}

export function sellerPayoutTierEducationCopy(): { title: string; body: string } {
  return {
    title: "Instant Payouts",
    body: "Build your reputation on Get Vaulted to unlock faster access to your earnings. Fast Payout sellers receive funds after the first carrier acceptance scan. Instant Payout sellers receive funds immediately after shipping label creation. Eligibility is based on account age, sales volume, account standing, fulfillment performance, and risk review.",
  };
}
