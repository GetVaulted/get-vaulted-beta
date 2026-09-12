/** Flat Get Vaulted platform fee charged to each trade party (USD). */
export const GET_VAULTED_TRADE_PLATFORM_FEE_USD = 2.99;

/**
 * Platform fee for a trade party.
 * Weight tier no longer sets the GV fee — each party pays actual outbound shipping separately.
 * `tier` is kept for call-site compatibility.
 */
export function tradeFeeUsdForTier(_tier?: string | null): number {
  return GET_VAULTED_TRADE_PLATFORM_FEE_USD;
}

export function tradeFeeCentsForTier(tier?: string | null): number {
  return Math.round(tradeFeeUsdForTier(tier) * 100);
}
