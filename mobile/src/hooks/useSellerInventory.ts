import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSellerInventoryFromWeb, type SellerInventorySnapshot } from '../api/sellerInventoryRepository';
import { subscribeHomeFeedInvalidation } from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import type { SellerReloadOptions } from './sellerReloadOptions';

const EMPTY: SellerInventorySnapshot = { marketplace: [], liveShow: [] };

export function useSellerInventory(accessToken: string | undefined, enabled: boolean) {
  const [data, setData] = useState<SellerInventorySnapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const reload = useCallback(
    async (opts?: SellerReloadOptions) => {
      if (!enabled || !accessToken || !isSupabaseConfigured()) {
        requestRef.current += 1;
        setData(EMPTY);
        setLoading(false);
        setRefreshing(false);
        setLoadedOnce(false);
        loadedOnceRef.current = false;
        return;
      }

      const requestId = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const next = await fetchSellerInventoryFromWeb(accessToken);
        if (requestId !== requestRef.current) return;
        setData(next);
        setLoadedOnce(true);
        loadedOnceRef.current = true;
      } catch (e) {
        console.warn('[inventory] fetch failed', e);
        if (requestId !== requestRef.current) return;
        if (!loadedOnceRef.current) setData(EMPTY);
      } finally {
        if (requestId !== requestRef.current) return;
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [accessToken, enabled],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeHomeFeedInvalidation(() => {
      void reload({ silent: true });
    });
  }, [enabled, reload]);

  const refresh = useCallback(async () => {
    await reload({ silent: true });
  }, [reload]);

  return { ...data, loading, refreshing, loadedOnce, refresh, reload };
}
