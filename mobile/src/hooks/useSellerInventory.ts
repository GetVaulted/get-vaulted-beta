import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { fetchSellerInventoryFromWeb, type SellerInventorySnapshot } from '../api/sellerInventoryRepository';
import { subscribeHomeFeedInvalidation } from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';

const EMPTY: SellerInventorySnapshot = { marketplace: [], liveShow: [] };

export function useSellerInventory(accessToken: string | undefined, enabled: boolean) {
  const [data, setData] = useState<SellerInventorySnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled || !accessToken || !isSupabaseConfigured()) {
        setData(EMPTY);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      try {
        setData(await fetchSellerInventoryFromWeb(accessToken));
      } catch (e) {
        console.warn('[inventory] fetch failed', e);
        setData(EMPTY);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, enabled],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void reload({ silent: true });
    }, [enabled, reload]),
  );

  useEffect(() => {
    if (!enabled) return;
    return subscribeHomeFeedInvalidation(() => {
      void reload({ silent: true });
    });
  }, [enabled, reload]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload({ silent: true });
  }, [reload]);

  return { ...data, loading, refreshing, refresh };
}
