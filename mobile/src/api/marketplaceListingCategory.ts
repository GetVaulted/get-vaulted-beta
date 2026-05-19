import { normalizeCategoryId, type CategoryId } from '../types';

/** Map web marketplace category labels to mobile `CategoryId`. */
export function mapListingCategoryToCategoryId(raw: string | null | undefined): CategoryId {
  const normalized = normalizeCategoryId((raw ?? '').trim().toLowerCase());
  if (normalized) return normalized;

  const s = (raw ?? '').toLowerCase();
  if (s.includes('trading card')) return 'cards';
  if (s.includes('other collectible')) return 'other';
  if (s.includes('apparel') || s.includes('fashion')) return 'other';
  if (s.includes('trading') || s.includes('tcg') || s.includes('pokemon') || s.includes('yugioh')) return 'cards';
  if (s.includes('sealed') || s.includes('hobby') || s === 'wax') return 'cards';
  if (s === 'breaks' || s === 'break') return 'cards';
  if (s.includes('card') || s.includes('slab') || s.includes('psa') || s === 'trade_qa') return 'cards';
  if (s.includes('sneaker') || s.includes('footwear')) return 'sneakers';
  if (s.includes('watch')) return 'watches';
  if (s.includes('memo') || s.includes('jersey') || s.includes('game') || s.includes('sport')) return 'memorabilia';
  if (
    s.includes('electronic') ||
    s.includes('tech') ||
    s.includes('phone') ||
    s.includes('tablet') ||
    s.includes('laptop') ||
    s.includes('console') ||
    s.includes('gaming pc')
  ) {
    return 'other';
  }
  if (s === 'art / other' || s.startsWith('art') || s.includes('other')) return 'other';
  return 'luxury';
}
