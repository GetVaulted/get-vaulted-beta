/**
 * Marketplace browse chips. Each chip maps to a server-side `category` filter on
 * `GET /api/listings?scope=published`, so a chip shows every matching listing in the catalog —
 * not just the ones already loaded on the phone.
 */
export type MarketplaceChipId = 'all' | 'helmets' | 'cards' | 'memorabilia';

export type MarketplaceChip = {
  id: MarketplaceChipId;
  label: string;
  /** Server category label; `undefined` means no category filter. */
  category?: string;
};

export const MARKETPLACE_CHIPS: readonly MarketplaceChip[] = [
  { id: 'all', label: 'All' },
  { id: 'helmets', label: 'Helmets', category: 'Helmets' },
  // The server expands "Trading Cards" to both the "Trading Cards" and "Cards" listing labels.
  { id: 'cards', label: 'Cards', category: 'Trading Cards' },
  { id: 'memorabilia', label: 'Memorabilia', category: 'Memorabilia' },
];

export function marketplaceChipCategory(id: MarketplaceChipId): string | undefined {
  return MARKETPLACE_CHIPS.find((c) => c.id === id)?.category;
}
