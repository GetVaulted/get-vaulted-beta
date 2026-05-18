import type { Ionicons } from '@expo/vector-icons';
import type { CategoryId, Product } from '../types';

/** Marketplace browse lane — supports special filters beyond raw CategoryId. */
export type MarketplaceLaneId =
  | 'all'
  | 'cards'
  | 'memorabilia'
  | 'sneakers'
  | 'watches'
  | 'sealed'
  | 'breaks'
  | 'trading_cards'
  | 'apparel'
  | 'vault_verified';

export type MarketplaceLaneChip = {
  id: MarketplaceLaneId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Future: trending lane badge */
  badge?: 'trending' | 'new';
  /** Future: live inventory count */
  count?: number;
};

export const MARKETPLACE_LANES: MarketplaceLaneChip[] = [
  { id: 'all', label: 'All', icon: 'grid-outline' },
  { id: 'cards', label: 'Sports Cards', icon: 'layers-outline' },
  { id: 'memorabilia', label: 'Memorabilia', icon: 'ribbon-outline' },
  { id: 'sneakers', label: 'Sneakers', icon: 'footsteps-outline' },
  { id: 'watches', label: 'Watches', icon: 'time-outline' },
  { id: 'sealed', label: 'Sealed', icon: 'cube-outline' },
  { id: 'breaks', label: 'Breaks', icon: 'flash-outline' },
  { id: 'trading_cards', label: 'Trading Cards', icon: 'albums-outline' },
  { id: 'apparel', label: 'Apparel', icon: 'shirt-outline' },
  { id: 'vault_verified', label: 'Vault Verified', icon: 'shield-checkmark' },
];

const SEALED_RE = /sealed|hobby|wax|box break/i;
const BREAK_RE = /break|spot|rip/i;

export function filterCatalogByMarketplaceLane(catalog: Product[], lane: MarketplaceLaneId): Product[] {
  if (lane === 'all') return catalog;
  if (lane === 'vault_verified') return catalog.filter((p) => p.vaultVerified);
  if (lane === 'cards') return catalog.filter((p) => p.category === 'cards');
  if (lane === 'trading_cards') return catalog.filter((p) => p.category === 'cards');
  if (lane === 'memorabilia') return catalog.filter((p) => p.category === 'memorabilia');
  if (lane === 'sneakers') return catalog.filter((p) => p.category === 'sneakers');
  if (lane === 'watches') return catalog.filter((p) => p.category === 'watches' || p.category === 'luxury');
  if (lane === 'apparel') {
    return catalog.filter((p) => p.category === 'sneakers' || p.category === 'luxury' || p.category === 'other');
  }
  if (lane === 'sealed') {
    return catalog.filter((p) => SEALED_RE.test(p.title) || SEALED_RE.test(p.conditionGrade ?? ''));
  }
  if (lane === 'breaks') {
    return catalog.filter(
      (p) =>
        BREAK_RE.test(p.title) ||
        Boolean(p.featuredInLive) ||
        (p.category === 'cards' && SEALED_RE.test(p.title)),
    );
  }
  return catalog;
}

/** @deprecated Use MarketplaceLaneId */
export type MarketplaceCategoryFilter = MarketplaceLaneId;
