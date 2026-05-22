import { clearHomeFeedCache } from './homeFeedCache';

/**
 * After a listing mutation, bust mobile discovery/marketplace caches so Seller HQ,
 * Home, and Marketplace refetch on their invalidation listeners.
 */
export async function notifyListingCatalogChanged(): Promise<void> {
  await clearHomeFeedCache();
}
