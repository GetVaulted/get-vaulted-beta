import type { CategoryId, LiveStream } from '../types';

/** Discovery / filter chips — hobby-first (sports cards, breaks, memorabilia, sneakers, watches). */
export const discoveryCategoryChips = [
  'Breaks',
  'Cards',
  'Memorabilia',
  'Sneakers',
  'Watches',
  'Luxury',
  'Other',
  'Vault Drops',
  'All',
] as const;

export type DiscoveryChip = (typeof discoveryCategoryChips)[number];

export const categoryMeta: Record<CategoryId, { label: string; tagline: string }> = {
  watches: { label: 'Watches', tagline: 'Authenticated timepieces from trusted sellers.' },
  sneakers: { label: 'Sneakers', tagline: 'Heat, deadstock, and live pull culture.' },
  cards: { label: 'Sports Cards', tagline: 'Slabs, rookies, chrome, and breaker-room chases.' },
  memorabilia: {
    label: 'Memorabilia',
    tagline: 'Signed pieces, game-used, and championship keepsakes.',
  },
  luxury: { label: 'Luxury', tagline: 'High-end collectibles when they hit the vault.' },
  other: {
    label: 'Other',
    tagline: 'Electronics, art, hobbies, and anything outside our specialty lanes — open to all sellers.',
  },
};

export function filterShowsByChip(shows: LiveStream[], chip: string): LiveStream[] {
  if (chip === 'All') return shows;
  return shows.filter((s) => {
    if (s.discoveryTags.includes(chip) || s.categoryTags.includes(chip)) return true;
    if (categoryMeta[s.category].label === chip) return true;
    if (chip === 'Memorabilia' && s.category === 'memorabilia') return true;
    if (
      chip === 'Cards' &&
      (s.category === 'cards' ||
        s.discoveryTags.some((t) => /card|slab|psa|chrome/i.test(t)) ||
        s.categoryTags.some((t) => /card|slab|psa|chrome/i.test(t)))
    ) {
      return true;
    }
    if (chip === 'Breaks' && (s.discoveryTags.includes('Breaks') || s.categoryTags.includes('Breaks'))) return true;
    if (chip === 'Vault Drops' && s.discoveryTags.includes('Vault Drops')) return true;
    return false;
  });
}
