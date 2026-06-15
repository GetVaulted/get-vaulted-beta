import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSellerLiveShowOrders, type SellerSalesOrderRow } from '../api/sellerSalesRepository';
import type { SellerReloadOptions } from './sellerReloadOptions';
import { useMoneyStateSync } from './useMoneyStateSync';

/** Live show orders — fast refresh while hosting so sales appear instantly on the Live Orders tab. */
export function useSellerLiveOrdersSummary(
  accessToken: string | undefined,
  liveShowId: string | null | undefined,
  opts?: { canonicalUserId?: string; supabaseUserId?: string; enabled?: boolean },
) {
  const [orders, setOrders] = useState<SellerSalesOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const showId = liveShowId?.trim() || null;
  const enabled = (opts?.enabled ?? true) && Boolean(accessToken && showId);

  const reload = useCallback(
    async (reloadOpts?: SellerReloadOptions) => {
      if (!accessToken || !showId) {
        requestRef.current += 1;
        setOrders([]);
        setLoading(false);
        setLoadedOnce(false);
        loadedOnceRef.current = false;
        return;
      }

      const requestId = ++requestRef.current;
      const silent = reloadOpts?.silent ?? loadedOnceRef.current;
      if (!silent) setLoading(true);

      try {
        const rows = await fetchSellerLiveShowOrders(accessToken, showId);
        if (requestId !== requestRef.current) return;
        setOrders(rows);
        setLoadedOnce(true);
        loadedOnceRef.current = true;
      } catch {
        if (requestId !== requestRef.current) return;
        if (!loadedOnceRef.current) setOrders([]);
      } finally {
        if (requestId !== requestRef.current) return;
        setLoadedOnce(true);
        loadedOnceRef.current = true;
        if (!silent) setLoading(false);
      }
    },
    [accessToken, showId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useMoneyStateSync({
    enabled,
    canonicalUserId: opts?.canonicalUserId,
    supabaseUserId: opts?.supabaseUserId,
    refetch: () => reload({ silent: true }),
    pollIntervalMs: 4_000,
    refetchOnFocus: true,
  });

  return { orders, loading, loadedOnce, reload, liveShowId: showId };
}
