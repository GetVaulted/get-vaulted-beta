/** Mirrors `public.trade_fee_amount_for_tier` in Supabase (USD). */
export function tradeFeeUsdForTier(tier: string | null | undefined): number {
  switch (tier) {
    case 'cards_slabs':
      return 12;
    case 'sneakers':
      return 16;
    case 'memorabilia':
      return 22;
    case 'watches_luxury':
      return 28;
    case 'oversized_custom':
      return 45;
    default:
      return 15;
  }
}

export function tradeFeeCentsForTier(tier: string | null | undefined): number {
  return Math.round(tradeFeeUsdForTier(tier) * 100);
}
