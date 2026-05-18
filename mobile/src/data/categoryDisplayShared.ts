import type { CategoryId } from '../types';

const LABEL_ALIASES: Record<string, string> = {
  cards: 'Sports Cards',
  card: 'Sports Cards',
  'sports cards': 'Sports Cards',
  'sports card': 'Sports Cards',
  sportscards: 'Sports Cards',
  'trading cards': 'Trading Cards',
  'trading card': 'Trading Cards',
  tcg: 'Trading Cards',
  breaks: 'Breaks',
  break: 'Breaks',
  sealed: 'Sealed',
  wax: 'Sealed',
  sneakers: 'Sneakers',
  sneaker: 'Sneakers',
  footwear: 'Sneakers',
  watches: 'Watches',
  watch: 'Watches',
  timepieces: 'Watches',
  memorabilia: 'Memorabilia',
  memo: 'Memorabilia',
  luxury: 'Luxury',
  apparel: 'Apparel',
  fashion: 'Apparel',
  collectibles: 'Other Collectibles',
  'other collectibles': 'Other Collectibles',
  other: 'Other Collectibles',
  vault: 'Vault',
};

export const CATEGORY_ID_DEFAULT_LABEL: Record<CategoryId, string> = {
  cards: 'Sports Cards',
  sneakers: 'Sneakers',
  watches: 'Watches',
  memorabilia: 'Memorabilia',
  luxury: 'Luxury',
  other: 'Other Collectibles',
};

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Human category lane for live room cards, discovery tiles, and filters. */
export function formatLiveRoomCategoryLabel(
  raw: string | null | undefined,
  categoryId: CategoryId,
): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed) {
    const key = normalizeKey(trimmed);
    if (LABEL_ALIASES[key]) return LABEL_ALIASES[key];
    if (trimmed.includes(' ') || /[A-Z]/.test(trimmed.slice(1))) return trimmed;
    return titleCaseWords(trimmed);
  }
  return CATEGORY_ID_DEFAULT_LABEL[categoryId];
}
