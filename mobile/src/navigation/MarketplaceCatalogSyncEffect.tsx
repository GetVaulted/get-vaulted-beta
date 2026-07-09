import { useEffect } from 'react';
import { clearHomeFeedCache } from '../lib/homeFeedCache';
import { MARKETPLACE_CATALOG_CHANNEL, MARKETPLACE_CATALOG_EVENT } from '../lib/marketplaceCatalogRealtime';
import { getSupabase } from '../lib/supabase';

/** App-wide Supabase listener so Home/Marketplace bust caches when any seller publishes. */
export function MarketplaceCatalogSyncEffect() {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel(MARKETPLACE_CATALOG_CHANNEL)
      .on('broadcast', { event: MARKETPLACE_CATALOG_EVENT }, () => {
        void clearHomeFeedCache();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, []);

  return null;
}
