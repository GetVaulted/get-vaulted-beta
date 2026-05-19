import {
  fetchListingsByIdsFromWeb,
  fetchMarketplaceListingFromWeb,
  fetchPublishedListingsFromWeb,
} from './webListingsRepository';
import { mapListingCategoryToCategoryId } from './marketplaceListingCategory';
import { mapWebMarketplaceListingToProduct } from './mapWebMarketplaceListing';
import type { CategoryId, Product } from '../types';

export { mapListingCategoryToCategoryId } from './marketplaceListingCategory';

function isPublishedOnMarketplace(status: string | undefined): boolean {
  return status === 'active' || status === 'auction_live';
}

export async function fetchMarketplaceListings(opts?: {
  category?: CategoryId;
  limit?: number;
}): Promise<Product[]> {
  const lim = Math.min(Math.max(opts?.limit ?? 32, 1), 60);
  const rows = await fetchPublishedListingsFromWeb();
  const published = rows.filter((r) => isPublishedOnMarketplace(r.listingStatus));
  const filtered = opts?.category
    ? published.filter((r) => mapListingCategoryToCategoryId(r.category) === opts.category)
    : published;
  return filtered.slice(0, lim).map(mapWebMarketplaceListingToProduct);
}

export async function fetchMarketplaceListingById(listingId: string): Promise<Product | null> {
  const listing = await fetchMarketplaceListingFromWeb(listingId);
  if (!listing || !isPublishedOnMarketplace(listing.listingStatus)) return null;
  return mapWebMarketplaceListingToProduct(listing);
}

/** Retry briefly after publish — avoids empty Product detail on first paint. */
export async function fetchMarketplaceListingByIdWithRetry(
  listingId: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<Product | null> {
  const attempts = Math.max(1, opts?.attempts ?? 4);
  const delayMs = opts?.delayMs ?? 350;
  for (let i = 0; i < attempts; i++) {
    const product = await fetchMarketplaceListingById(listingId);
    if (product) return product;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

export async function fetchListingsBySeller(opts: {
  sellerId: string;
  excludeListingId?: string;
  limit?: number;
}): Promise<Product[]> {
  const lim = Math.min(Math.max(opts.limit ?? 12, 1), 24);
  const rows = await fetchPublishedListingsFromWeb();
  let filtered = rows.filter(
    (r) => r.sellerId === opts.sellerId && isPublishedOnMarketplace(r.listingStatus),
  );
  if (opts.excludeListingId) {
    filtered = filtered.filter((r) => r.id !== opts.excludeListingId);
  }
  return filtered.slice(0, lim).map(mapWebMarketplaceListingToProduct);
}

/** Batch hydrate listing cards (e.g. trade center) from the shared web catalog. */
export async function fetchMarketplaceProductsByIds(ids: string[]): Promise<Product[]> {
  const rows = await fetchListingsByIdsFromWeb(ids);
  return rows.map(mapWebMarketplaceListingToProduct);
}
