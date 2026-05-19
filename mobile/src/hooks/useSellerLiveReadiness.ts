import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerLiveReadiness, type SellerLiveReadiness } from '../api/liveHostRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';

const EMPTY: SellerLiveReadiness = { canGoLive: false, issues: [] };

export function useSellerLiveReadiness(accessToken: string | undefined) {
  const [readiness, setReadiness] = useState<SellerLiveReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<SellerLiveReadiness | null> => {
    if (!accessToken) {
      setReadiness(null);
      setError(null);
      return null;
    }
    setLoading(true);
    try {
      const r = await fetchSellerLiveReadiness(accessToken);
      setReadiness(r);
      setError(null);
      return r;
    } catch (e) {
      setReadiness(null);
      setError(e instanceof Error ? e.message : 'Could not load go-live readiness.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void refresh();
    }, 950);
    return () => task.cancel();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return {
    readiness: readiness ?? EMPTY,
    readinessLoaded: readiness !== null,
    error,
    loading,
    refresh,
  };
}
