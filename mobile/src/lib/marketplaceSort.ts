/** Sort choices for the marketplace grid. `value` is the server `sort` param. */
export type MarketplaceSortValue = 'recent' | 'price-asc' | 'price-desc' | 'seller-level';

export const MARKETPLACE_SORTS: readonly { value: MarketplaceSortValue; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'seller-level', label: 'Top sellers' },
];

export function marketplaceSortLabel(value: MarketplaceSortValue): string {
  return MARKETPLACE_SORTS.find((s) => s.value === value)?.label ?? 'Newest';
}
