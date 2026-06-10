import { resolveListingImageUrl } from '../api/mapWebMarketplaceListing';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import type { Product } from '../types';

/** Get Vaulted publish cap — gallery renders every URL in `imageUrls` with no UI/mapper limit below this. */
export const LISTING_GALLERY_PHOTO_LIMIT = LISTING_MAX_PHOTOS;

export type GallerySlide = {
  id: string;
  uri: string;
  caption: string;
  kind: 'hero' | 'macro' | 'detail' | 'video';
};

export const LISTING_GALLERY_FALLBACK =
  'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=1200';

/** Dedupe only exact URL matches — preserves distinct uploads. */
export function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const trimmed = raw?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function collectListingImageUrls(
  product: Pick<Product, 'imageUrls' | 'imageUrl'>,
): string[] {
  const resolved = (product.imageUrls ?? [])
    .map((u) => resolveListingImageUrl(u))
    .filter((u): u is string => Boolean(u?.trim()));
  const fromArray = dedupeImageUrls(resolved);
  if (fromArray.length) return fromArray;

  const single = resolveListingImageUrl(product.imageUrl);
  return single ? [single] : [];
}

/**
 * One gallery slide per uploaded photo; featured image stays first.
 * No slice/take/max — all collected URLs become swipeable slides and thumbnails.
 */
export function buildListingGallerySlides(product: Product): GallerySlide[] {
  const urls = collectListingImageUrls(product);
  if (!urls.length) {
    return [
      {
        id: 'fallback',
        uri: LISTING_GALLERY_FALLBACK,
        caption: 'Listing photo',
        kind: 'hero',
      },
    ];
  }

  return urls.map((uri, index) => ({
    id: `photo-${index}`,
    uri,
    caption: index === 0 ? 'Featured' : `Photo ${index + 1}`,
    kind: index === 0 ? 'hero' : 'detail',
  }));
}
