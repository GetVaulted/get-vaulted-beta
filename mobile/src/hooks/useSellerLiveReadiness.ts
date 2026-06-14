import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerLiveReadiness, type SellerLiveReadiness } from '../api/liveHostRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import type { SellerReloadOptions } from './sellerReloadOptions';

export function useSellerLiveReadiness(accessToken: string | undefined) {
  const [readiness, setReadiness] = useState<SellerLiveReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const refresh = useCallback(
    async (opts?: SellerReloadOptions): Promise<SellerLiveReadiness | null> => {
      if (!accessToken) {
        requestRef.current += 1;
        setReadiness(null);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        setLoadedOnce(false);
        loadedOnceRef.current = false;
        return null;
      }

      const requestId = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (!silent) setLoading(true);

      try {
        const r = await fetchSellerLiveReadiness(accessToken);
        if (requestId !== requestRef.current) return r;
        setReadiness(r);
        setError(null);
        setLoadedOnce(true);
        loadedOnceRef.current = true;
        return r;
      } catch (e) {
        if (requestId !== requestRef.current) return null;
        if (!loadedOnceRef.current) setReadiness(null);
        setError(e instanceof Error ? e.message : 'Could not load go-live readiness.');
        return null;
      } finally {
        if (requestId !== requestRef.current) return null;
        if (!silent) setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void refresh();
    }, 950);
    return () => task.cancel();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh({ silent: true });
    });
    return () => sub.remove();
  }, [refresh]);

  return {
    readiness,
    readinessLoaded: loadedOnce,
    error,
    loading,
    refreshing,
    loadedOnce,
    refresh,
  };
}
