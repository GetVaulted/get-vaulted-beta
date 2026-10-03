/**
 * Shared platform-fee defaults + clamp. Keep this file free of service imports
 * so marketplace/live fee settings caches can depend on it without cycles.
 */

/** Marketplace + live base platform fee default (Stripe processing is separate). */
export const MARKETPLACE_PLATFORM_FEE_PERCENT = 6.75;

/** Absolute max Get Vaulted platform fee on item — never charge or configure above this. */
export const PLATFORM_FEE_PERCENT_MAX = 6.75;

export const LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD = 3000;
export const LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD = 5500;

export const LIVE_SHOW_TIER_1_FEE_PERCENT = 6.75;
export const LIVE_SHOW_TIER_2_FEE_PERCENT = 5.75;
export const LIVE_SHOW_TIER_3_FEE_PERCENT = 5;

/** Clamp a platform fee percent into [0, PLATFORM_FEE_PERCENT_MAX]. */
export function clampPlatformFeePercent(raw: number, fallback = MARKETPLACE_PLATFORM_FEE_PERCENT): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(PLATFORM_FEE_PERCENT_MAX, Math.max(0, Math.round(raw * 100) / 100));
}
