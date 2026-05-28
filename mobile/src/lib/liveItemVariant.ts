import type { LiveItemVariantSnapshot, LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';

export type LiveItemSalesFormat = 'auction' | 'buy_now' | 'variant_selection' | 'team_break';

export function isVariantSalesFormat(format: string | null | undefined): format is 'variant_selection' | 'team_break' {
  return format === 'variant_selection' || format === 'team_break';
}

export function isActiveVariantBuyerItem(snap: LiveRoomBuyerSnapshot | null | undefined): boolean {
  if (!snap?.activeItemId || snap.status !== 'live') return false;
  if (!isVariantSalesFormat(snap.activeItemSalesFormat)) return false;
  return (snap.activeItemVariants?.length ?? 0) > 0;
}

export function variantIsAvailable(v: LiveItemVariantSnapshot): boolean {
  return v.quantityRemaining > 0 && v.status !== 'sold_out';
}

export function availableVariantCount(variants: LiveItemVariantSnapshot[] | undefined): number {
  return (variants ?? []).filter(variantIsAvailable).length;
}

export function lowestAvailableVariantPrice(variants: LiveItemVariantSnapshot[] | undefined): number | null {
  const prices = (variants ?? []).filter(variantIsAvailable).map((v) => v.priceUsd);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function variantSelectSpotLabel(format: LiveItemSalesFormat | null | undefined): string {
  return format === 'team_break' ? 'Select Team' : 'Select Spot';
}
