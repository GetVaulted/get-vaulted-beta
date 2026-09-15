import {
  fetchListingsByIdsFromWeb,
  fetchMarketplaceListingFromWeb,
  fetchPublishedListingsFromWeb,
  fetchPublishedListingsPageFromWeb,
} from './webListingsRepository';
import { mapListingCategoryToCategoryId } from './marketplaceListingCategory';
import { mapWebMarketplaceListingToProduct } from './mapWebMarketplaceListing';
import { filterBrowsableMarketplaceProducts } from '../lib/marketplaceListingQuality';
import type { CategoryId, Product } from '../types';

export { mapListingCategoryToCategoryId } from './marketplaceListingCategory';

function isPublishedOnMarketplace(status: string | undefined): boolean {
  return status === 'active' || status === 'auction_live';
}

function isMarketplaceDetailVisible(status: string | undefined): boolean {
  return (
    status === 'active' ||
    status === 'auction_live' ||
    status === 'layaway_reserved' ||
    status === 'sold'
  );
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
  const mapped = filtered.slice(0, lim * 2).map(mapWebMarketplaceListingToProduct);
  return filterBrowsableMarketplaceProducts(mapped).slice(0, lim);
}

export type MarketplaceListingsPage = {
  products: Product[];
  hasMore: boolean;
  page: number;
  totalListingCount: number;
};

/**
 * Real pagination for the main marketplace browse grid — `fetchMarketplaceListings` above always
 * silently returns just a first, capped batch (at most 60 rows) with no way to ask for more, which
 * made anything past that cutoff permanently unreachable in the app once the catalog grew past it.
 * This calls the same `scope=published` endpoint the web marketplace's own "Load more" already
 * uses correctly, actually sending `page`/`pageSize` so every listing is reachable by scrolling.
 */
export async function fetchMarketplaceListingsPage(opts: {
  page: number;
  pageSize?: number;
}): Promise<MarketplaceListingsPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 60, 1), 100);
  const result = await fetchPublishedListingsPageFromWeb({ page: opts.page, pageSize });
  const published = result.listings.filter((r) => isPublishedOnMarketplace(r.listingStatus));
  const products = filterBrowsableMarketplaceProducts(published.map(mapWebMarketplaceListingToProduct));
  return {
    products,
    hasMore: result.hasMore,
    page: result.page,
    totalListingCount: result.totalListingCount,
  };
}

export async function fetchMarketplaceListingById(listingId: string): Promise<Product | null> {
  const listing = await fetchMarketplaceListingFromWeb(listingId);
  if (!listing || !isMarketplaceDetailVisible(listing.listingStatus)) return null;
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
