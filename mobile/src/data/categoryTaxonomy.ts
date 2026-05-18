import type { CategoryId, LiveStream } from '../types';
import { formatLiveRoomCategoryLabel } from '../lib/liveRoomDisplay';

/** Discovery filter chips — premium live collectible lanes. */
export const discoveryCategoryChips = [
  'All',
  'Sports Cards',
  'Trading Cards',
  'Sneakers',
  'Watches',
  'Memorabilia',
  'Sealed',
  'Vault Drops',
  'Other Collectibles',
] as const;

export type DiscoveryChip = (typeof discoveryCategoryChips)[number];

export const categoryMeta: Record<CategoryId, { label: string; tagline: string }> = {
  watches: { label: 'Watches', tagline: 'Authenticated timepieces and live auction lanes.' },
  sneakers: { label: 'Sneakers', tagline: 'Heat, deadstock, and live drop culture.' },
  cards: { label: 'Sports Cards', tagline: 'Slabs, rookies, and live auction rooms.' },
  memorabilia: {
    label: 'Memorabilia',
    tagline: 'Signed pieces, game-used, and championship keepsakes.',
  },
  luxury: { label: 'Luxury', tagline: 'High-end collectibles when they hit the vault.' },
  other: {
    label: 'Other Collectibles',
    tagline: 'Apparel, art, sealed, and every lane in the live vault.',
  },
};

function showMatchesChip(show: LiveStream, chip: string): boolean {
  const lane = formatLiveRoomCategoryLabel(show.categoryTags[0] ?? null, show.category);
  if (lane === chip) return true;
  if (show.discoveryTags.includes(chip) || show.categoryTags.includes(chip)) return true;
  if (categoryMeta[show.category].label === chip) return true;

  if (chip === 'Sports Cards') {
    return (
      show.category === 'cards' &&
      !lane.toLowerCase().includes('trading') &&
      !lane.toLowerCase().includes('sealed')
    );
  }
  if (chip === 'Trading Cards') {
    return lane.toLowerCase().includes('trading') || show.categoryTags.some((t) => /trading|tcg/i.test(t));
  }
  if (chip === 'Sealed') {
    return lane.toLowerCase().includes('sealed') || show.categoryTags.some((t) => /sealed|wax|hobby/i.test(t));
  }
  if (chip === 'Memorabilia' && show.category === 'memorabilia') return true;
  if (chip === 'Sneakers' && show.category === 'sneakers') return true;
  if (chip === 'Watches' && (show.category === 'watches' || show.category === 'luxury')) return true;
  if (chip === 'Other Collectibles' && show.category === 'other') return true;
  if (chip === 'Vault Drops' && show.discoveryTags.includes('Vault Drops')) return true;
  return false;
}

export function filterShowsByChip(shows: LiveStream[], chip: string): LiveStream[] {
  if (chip === 'All') return shows;
  return shows.filter((s) => showMatchesChip(s, chip));
}
