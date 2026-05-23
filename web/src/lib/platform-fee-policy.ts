/** Fixed marketplace listing platform fee (Stripe processing is separate). */
export const MARKETPLACE_PLATFORM_FEE_PERCENT = 8;

export const LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD = 1000;
export const LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD = 3000;

export const LIVE_SHOW_TIER_1_FEE_PERCENT = 8;
export const LIVE_SHOW_TIER_2_FEE_PERCENT = 7.25;
export const LIVE_SHOW_TIER_3_FEE_PERCENT = 6.5;

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
  return MARKETPLACE_PLATFORM_FEE_PERCENT;
}

/** Tier for the *next* sale based on completed GMV so far in this live show session. */
export function liveShowPlatformFeePercent(completedGmvUsd: number): number {
  const gmv = Math.max(0, completedGmvUsd);
  if (gmv >= LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD) return LIVE_SHOW_TIER_3_FEE_PERCENT;
  if (gmv >= LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD) return LIVE_SHOW_TIER_2_FEE_PERCENT;
  return LIVE_SHOW_TIER_1_FEE_PERCENT;
}

export function buildLiveShowFeeTierSnapshot(completedGmvUsd: number): LiveShowFeeTierSnapshot {
  const gmv = Math.max(0, completedGmvUsd);
  const currentFeePercent = liveShowPlatformFeePercent(gmv);

  if (gmv < LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD) {
    return {
      completedGmvUsd: gmv,
      currentFeePercent,
      currentTierLabel: "Base",
      nextTierFeePercent: LIVE_SHOW_TIER_2_FEE_PERCENT,
      nextTierThresholdUsd: LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD,
      usdToNextTier: LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD - gmv,
    };
  }

  if (gmv < LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD) {
    return {
      completedGmvUsd: gmv,
      currentFeePercent,
      currentTierLabel: "Volume",
      nextTierFeePercent: LIVE_SHOW_TIER_3_FEE_PERCENT,
      nextTierThresholdUsd: LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD,
      usdToNextTier: LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD - gmv,
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

export function marketplaceApplicationFeeCents(subtotalUsd: number, isCompanyListing: boolean): number {
  if (isCompanyListing) return 0;
  return applicationFeeCentsFromSubtotalUsd(subtotalUsd, marketplacePlatformFeePercent());
}

export function liveShowApplicationFeeCents(
  subtotalUsd: number,
  completedGmvUsd: number,
  isCompanyListing = false,
): number {
  if (isCompanyListing) return 0;
  const pct = liveShowPlatformFeePercent(completedGmvUsd);
  return applicationFeeCentsFromSubtotalUsd(subtotalUsd, pct);
}
