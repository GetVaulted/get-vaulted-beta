/** Flat Get Vaulted platform fee charged to each trade party (USD). */
export const GET_VAULTED_TRADE_PLATFORM_FEE_USD = 2.99;

export function tradePlatformFeeCents(): number {
  return Math.round(GET_VAULTED_TRADE_PLATFORM_FEE_USD * 100);
}
