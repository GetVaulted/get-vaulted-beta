import { getCachedMarketplacePlatformFeePercent } from "@/services/platform-fee-settings";
import { getCachedLiveShowFeeConfig } from "@/services/live-show-fee-settings";

/** Fixed marketplace listing platform fee default (Stripe processing is separate). Admin may override in DB. */
export const MARKETPLACE_PLATFORM_FEE_PERCENT = 8;

export const LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD = 1000;
export const LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD = 3000;

export const LIVE_SHOW_TIER_1_FEE_PERCENT = 8;
export const LIVE_SHOW_TIER_2_FEE_PERCENT = 7.25;
export const LIVE_SHOW_TIER_3_FEE_PERCENT = 6.5;

/**
 * Platform fee applies to item/sale price only.
 * Shipping, tax, and tips are excluded from platform fee (Stripe processing is separate).
 */
export function platformFeeBaseUsd(saleAmountUsd: number): number {
  return Math.max(0, Number.isFinite(saleAmountUsd) ? saleAmountUsd : 0);
}

export type LiveShowFeeTierSnapshot = {
  completedGmvUsd: number;
  currentFeePercent: number;
  currentTierLabel: string;
  nextTierFeePercent: number | null;
  nextTierThresholdUsd: number | null;
  /** USD remaining in this show before the next lower fee tier; null at top tier. */
  usdToNextTier: number | null;
};

export function applicationFeeCentsFromSubtotalUsd(subtotalUsd: number, feePercent: number): number {
  if (!Number.isFinite(subtotalUsd) || subtotalUsd <= 0 || !Number.isFinite(feePercent) || feePercent <= 0) {
    return 0;
  }
  const feeUsd = (subtotalUsd * feePercent) / 100;
  return Math.max(0, Math.round(feeUsd * 100));
}

export function marketplacePlatformFeePercent(): number {
  return getCachedMarketplacePlatformFeePercent();
}

/** Tier for the *next* sale based on completed GMV so far in this live show session. */
export function liveShowPlatformFeePercent(completedGmvUsd: number): number {
  const cfg = getCachedLiveShowFeeConfig();
  const gmv = Math.max(0, completedGmvUsd);
  if (gmv >= cfg.tier3ThresholdUsd) return cfg.tier3FeePercent;
  if (gmv >= cfg.tier2ThresholdUsd) return cfg.tier2FeePercent;
  return cfg.tier1FeePercent;
}

export function buildLiveShowFeeTierSnapshot(completedGmvUsd: number): LiveShowFeeTierSnapshot {
  const cfg = getCachedLiveShowFeeConfig();
  const gmv = Math.max(0, completedGmvUsd);
  const currentFeePercent = liveShowPlatformFeePercent(gmv);

  if (gmv < cfg.tier2ThresholdUsd) {
    return {
      completedGmvUsd: gmv,
      currentFeePercent,
      currentTierLabel: "Base",
      nextTierFeePercent: cfg.tier2FeePercent,
      nextTierThresholdUsd: cfg.tier2ThresholdUsd,
      usdToNextTier: cfg.tier2ThresholdUsd - gmv,
    };
  }

  if (gmv < cfg.tier3ThresholdUsd) {
    return {
      completedGmvUsd: gmv,
      currentFeePercent,
      currentTierLabel: "Volume",
      nextTierFeePercent: cfg.tier3FeePercent,
      nextTierThresholdUsd: cfg.tier3ThresholdUsd,
      usdToNextTier: cfg.tier3ThresholdUsd - gmv,
    };
  }

  return {
    completedGmvUsd: gmv,
    currentFeePercent,
    currentTierLabel: "Top",
    nextTierFeePercent: null,
    nextTierThresholdUsd: null,
    usdToNextTier: null,
  };
}

export function marketplaceApplicationFeeCents(saleAmountUsd: number, isCompanyListing: boolean): number {
  if (isCompanyListing) return 0;
  return applicationFeeCentsFromSubtotalUsd(platformFeeBaseUsd(saleAmountUsd), marketplacePlatformFeePercent());
}

export function liveShowApplicationFeeCents(
  saleAmountUsd: number,
  completedGmvUsd: number,
  isCompanyListing = false,
): number {
  if (isCompanyListing) return 0;
  const pct = liveShowPlatformFeePercent(completedGmvUsd);
  return applicationFeeCentsFromSubtotalUsd(platformFeeBaseUsd(saleAmountUsd), pct);
}

/** Resolve platform fee percent for a checkout (sync; use completed GMV before this sale). */
export function resolvePlatformFeePercentForCheckout(args: {
  isCompanyListing: boolean;
  liveRoomId?: string | null;
  completedLiveShowGmvUsd?: number;
}): number {
  if (args.isCompanyListing) return 0;
  if (args.liveRoomId) {
    return liveShowPlatformFeePercent(args.completedLiveShowGmvUsd ?? 0);
  }
  return marketplacePlatformFeePercent();
}

/** Stripe Connect `application_fee_amount` — platform fee only, never processing. */
export function resolveCheckoutApplicationFeeCentsSync(args: {
  saleAmountUsd: number;
  isCompanyListing: boolean;
  liveRoomId?: string | null;
  completedLiveShowGmvUsd?: number;
}): number {
  if (args.isCompanyListing) return 0;
  const base = platformFeeBaseUsd(args.saleAmountUsd);
  if (args.liveRoomId) {
    return liveShowApplicationFeeCents(base, args.completedLiveShowGmvUsd ?? 0, false);
  }
  return marketplaceApplicationFeeCents(base, false);
}

/** GMV credited before this sale when reconstructing tier for a completed live order. */
export function completedLiveShowGmvBeforeSale(completedGmvUsd: number, saleAmountUsd: number): number {
  return Math.max(0, completedGmvUsd - platformFeeBaseUsd(saleAmountUsd));
}
