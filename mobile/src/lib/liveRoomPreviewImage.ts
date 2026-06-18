import type { CategoryId } from '../types';
import { resolveListingImageUrl } from '../api/mapWebMarketplaceListing';
import { getWebApiBaseUrl } from './webApiBaseUrl';

/** Branded Get Vaulted placeholder for live discovery tiles. */
export const DEFAULT_LIVE_ROOM_PREVIEW_IMAGE =
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=1500&q=80&auto=format&fit=crop';

const CATEGORY_PREVIEW: Record<string, string> = {
  cards: 'https://images.unsplash.com/photo-1606107557195-0f29cb4f3ccb?w=900&h=1125&q=80&auto=format&fit=crop',
  memorabilia: 'https://images.unsplash.com/photo-1566577730330-574a2072e3a7?w=900&h=1125&q=80&auto=format&fit=crop',
  sneakers: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&h=1125&q=80&auto=format&fit=crop',
  watches: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&h=1125&q=80&auto=format&fit=crop',
  sealed: 'https://images.unsplash.com/photo-1618351131374-a792ca659e41?w=900&h=1125&q=80&auto=format&fit=crop',
  luxury: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&h=1125&q=80&auto=format&fit=crop',
  other: DEFAULT_LIVE_ROOM_PREVIEW_IMAGE,
};

export type LiveRoomPreviewImageInput = {
  thumbnailUrl?: string | null;
  firstItemImageUrl?: string | null;
  category?: CategoryId | string | null;
};

function categoryPreviewImage(category: CategoryId | string | null | undefined): string {
  if (category && typeof category === 'string') {
    const direct = CATEGORY_PREVIEW[category];
    if (direct) return direct;
  }
  const raw = (category ?? '').toString().trim().toLowerCase();
  if (raw.includes('card')) {
    return CATEGORY_PREVIEW.cards ?? DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
  }
  if (raw.includes('sneaker') || raw.includes('footwear')) {
    return CATEGORY_PREVIEW.sneakers ?? DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
  }
  if (raw.includes('watch')) {
    return CATEGORY_PREVIEW.watches ?? DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
  }
  if (raw.includes('memo')) {
    return CATEGORY_PREVIEW.memorabilia ?? DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
  }
  if (raw.includes('break')) {
    return 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=900&h=1125&q=80&auto=format&fit=crop';
  }
  return DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
}

/** Resolve relative upload paths against the web API host. */
export function resolveLiveRoomMediaUrl(url: string | null | undefined): string | undefined {
  return resolveListingImageUrl(url ?? undefined);
}

/** uploaded thumbnail → first listing/queue image → category art → branded placeholder */
export function resolveLiveRoomPreviewImage(input: LiveRoomPreviewImageInput): string {
  const thumb = resolveLiveRoomMediaUrl(input.thumbnailUrl);
  if (thumb) return thumb;
  const item = resolveLiveRoomMediaUrl(input.firstItemImageUrl);
  if (item) return item;
  return categoryPreviewImage(input.category);
}

/** Warn in dev when thumbnails are relative but API base is unset. */
export function assertLivePreviewResolvable(url: string | null | undefined): void {
  if (!__DEV__) return;
  const trimmed = url?.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return;
  if (!getWebApiBaseUrl()) {
    console.warn('[liveRoomPreviewImage] relative thumbnail without EXPO_PUBLIC_SITE_URL', trimmed.slice(0, 80));
  }
}
