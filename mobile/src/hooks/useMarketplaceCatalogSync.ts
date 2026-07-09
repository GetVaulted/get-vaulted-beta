import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { subscribeHomeFeedInvalidation } from '../lib/homeFeedCache';

const CATALOG_POLL_MS = 45_000;

/**
 * Refetch marketplace listings on tab focus, periodic poll, and home-feed cache invalidation.
 * Supabase broadcast is handled app-wide by MarketplaceCatalogSyncEffect.
 */
export function useMarketplaceCatalogSync(onRefresh: () => void | Promise<void>): void {
  const tick = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  useFocusEffect(
    useCallback(() => {
      const id = setInterval(tick, CATALOG_POLL_MS);
      return () => clearInterval(id);
    }, [tick]),
  );

  useEffect(() => subscribeHomeFeedInvalidation(() => tick()), [tick]);
}
