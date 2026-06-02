import { formatLiveRoomCategoryLabel } from '../data/categoryDisplayShared';
import type { CategoryId, LiveStream } from '../types';

export { formatLiveRoomCategoryLabel } from '../data/categoryDisplayShared';

/** Seller-facing vault event categories — label is persisted on the room. */
export type StreamCategoryOption = {
  label: string;
  categoryId: CategoryId;
};

/** Labels match web discovery filters (`web/src/content/live-rooms.ts`) and API category strings. */
export const STREAM_CATEGORY_OPTIONS: StreamCategoryOption[] = [
  { label: 'Trading Cards', categoryId: 'cards' },
  { label: 'Memorabilia', categoryId: 'memorabilia' },
  { label: 'Watches', categoryId: 'watches' },
  { label: 'Sneakers', categoryId: 'sneakers' },
  { label: 'Other', categoryId: 'other' },
];

const GENERIC_ENGAGEMENT = new Set(['live now', 'live', 'on air', 'breaking now']);

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function liveRoomCategoryLine(stream: LiveStream): string {
  const fromTags = stream.categoryTags
    .map((t) => formatLiveRoomCategoryLabel(t, stream.category))
    .filter((t, i, arr) => t && arr.indexOf(t) === i);
  if (fromTags.length) return fromTags[0];
  return formatLiveRoomCategoryLabel(null, stream.category);
}

function categoryBucket(stream: LiveStream): string {
  const key = normalizeKey(liveRoomCategoryLine(stream));
  if (key === 'breaks') return 'breaks';
  if (key.includes('trading')) return 'trading';
  if (key === 'sealed') return 'sealed';
  if (key.includes('sneaker') || key.includes('footwear')) return 'sneakers';
  if (key.includes('watch')) return 'watches';
  if (key.includes('memo')) return 'memorabilia';
  if (key.includes('apparel') || key.includes('fashion')) return 'apparel';
  if (key.includes('sport') && key.includes('card')) return 'sports_cards';
  if (key === 'sports cards') return 'sports_cards';
  if (key.includes('luxury')) return 'luxury';
  if (key.includes('other collectible') || key === 'collectibles') return 'collectibles';
  return stream.category;
}

function pickFromPool(pool: string[], stream: LiveStream): string {
  if (pool.length === 1) return pool[0];
  let hash = 0;
  for (let i = 0; i < stream.id.length; i++) hash = (hash + stream.id.charCodeAt(i)) % 997;
  return pool[hash % pool.length];
}

/** Break-format rooms only — not used as default platform language. */
function isBreakFormatRoom(stream: LiveStream): boolean {
  return (
    stream.liveRoomFormat === 'break' ||
    stream.hybridFocus === 'break' ||
    stream.liveCommerceMode === 'break'
  );
}

function categoryStatusPool(bucket: string, stream: LiveStream): string[] {
  if (bucket === 'breaks') return ['Break live', 'Spots live'];
  if (bucket === 'sports_cards' && isBreakFormatRoom(stream)) return ['Break live', 'Spots live'];
  if (bucket === 'sports_cards') return ['Auction live', 'Live bidding', 'Selling live'];
  if (bucket === 'trading') return ['Live auction', 'Selling live', 'Vault live'];
  if (bucket === 'sealed') return ['Live drops', 'Selling live', 'Vault live'];
  if (bucket === 'sneakers') return ['Heat live', 'Live drop', 'Live drops'];
  if (bucket === 'watches') return ['Auction live', 'Bid live', 'Collector live'];
  if (bucket === 'memorabilia') return ['Collector live', 'Vault live', 'On air'];
  if (bucket === 'luxury') return ['Vault live', 'Auction live', 'Collector live'];
  if (bucket === 'apparel') return ['Live drops', 'Selling live', 'On air'];
  if (bucket === 'collectibles') return ['Live now', 'Selling live', 'Vault live'];
  return ['Live now', 'Selling live', 'On air', 'Vault live'];
}

function modeStatus(stream: LiveStream): string | null {
  if (stream.currentBid > stream.startingBid) return 'Auction live';
  if (stream.buyNowPrice != null && stream.buyNowPrice > 0) return 'Selling live';
  if (stream.liveRoomFormat === 'auction') return 'Live bidding';
  if (stream.liveRoomFormat === 'hybrid') return 'Vault live';
  if (stream.messagesPerMin && stream.messagesPerMin > 18) return 'On air';
  return null;
}

/** Dynamic status for live cards — category-aware; breaker terms only on break lanes. */
export function liveRoomCardStatusLine(stream: LiveStream): string {
  if (stream.urgencyLine?.trim()) return stream.urgencyLine.trim();
  if (stream.heatLabel?.trim()) return stream.heatLabel.trim();
  if (stream.soldFlash?.trim()) return stream.soldFlash.trim();
  if (stream.socialMoment?.trim()) return stream.socialMoment.trim();

  const eng = stream.engagementLine?.trim();
  if (eng && !GENERIC_ENGAGEMENT.has(eng.toLowerCase())) return eng;

  const mode = modeStatus(stream);
  if (mode) return mode;

  const bucket = categoryBucket(stream);
  return pickFromPool(categoryStatusPool(bucket, stream), stream);
}

export function liveRoomCategoryTagsForRow(
  rawCategory: string | null | undefined,
  categoryId: CategoryId,
): string[] {
  const label = formatLiveRoomCategoryLabel(rawCategory, categoryId);
  return label ? [label] : [];
}
