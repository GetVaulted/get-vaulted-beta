import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSellerLayaways,
  type SellerLayawayCounts,
  type SellerLayawayRow,
} from '../api/layawayRepository';
import type { SellerReloadOptions } from './sellerReloadOptions';

export function useSellerLayawaySummary(accessToken: string | undefined) {
  const [counts, setCounts] = useState<SellerLayawayCounts | null>(null);
  const [layaways, setLayaways] = useState<SellerLayawayRow[]>([]);
  const [recent, setRecent] = useState<SellerLayawayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const hasLayaways = Boolean(
    counts && counts.active + counts.readyToShip + counts.overdueOrDefaulted > 0,
  );

  const reload = useCallback(async (opts?: SellerReloadOptions) => {
    if (!accessToken) {
      requestRef.current += 1;
      setCounts(null);
      setLayaways([]);
      setRecent([]);
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
      const data = await fetchSellerLayaways(accessToken);
      if (requestId !== requestRef.current) return;
      setCounts(data.counts);
      setLayaways(data.layaways);
      setRecent(data.layaways.slice(0, 3));
      setLoadedOnce(true);
      loadedOnceRef.current = true;
    } catch {
      if (requestId !== requestRef.current) return;
      if (!loadedOnceRef.current) {
        setCounts({ active: 0, readyToShip: 0, overdueOrDefaulted: 0 });
        setLayaways([]);
        setRecent([]);
      }
    } finally {
      if (requestId !== requestRef.current) return;
      setLoadedOnce(true);
      loadedOnceRef.current = true;
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { counts, layaways, recent, loading, refreshing, loadedOnce, hasLayaways, reload };
}
