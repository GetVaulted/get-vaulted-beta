import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSellerLiveShippingDashboard,
  type SellerLiveShippingDashboard,
} from '../api/sellerLiveShippingRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import type { SellerReloadOptions } from './sellerReloadOptions';

const EMPTY: SellerLiveShippingDashboard = { sessions: [] };

/** Live shipping sessions / bundles — same `/api/account/live-shipping` as web. */
export function useSellerLiveShipping(accessToken: string | undefined) {
  const [dashboard, setDashboard] = useState<SellerLiveShippingDashboard>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const reload = useCallback(
    async (opts?: SellerReloadOptions) => {
      if (!accessToken) {
        requestRef.current += 1;
        setDashboard(EMPTY);
        setLoading(false);
        setLoadedOnce(false);
        loadedOnceRef.current = false;
        return;
      }

      const requestId = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (!silent) setLoading(true);

      try {
        const next = await fetchSellerLiveShippingDashboard(accessToken);
        if (requestId !== requestRef.current) return;
        setDashboard(next);
        setLoadedOnce(true);
        loadedOnceRef.current = true;
      } catch {
        if (requestId !== requestRef.current) return;
        if (!loadedOnceRef.current) setDashboard(EMPTY);
      } finally {
        if (requestId !== requestRef.current) return;
        setLoadedOnce(true);
        loadedOnceRef.current = true;
        if (!silent) setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void reload();
    }, 800);
    return () => task.cancel();
  }, [reload]);

  return { dashboard, loading, loadedOnce, reload };
}
