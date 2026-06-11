import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerConnectStatus, type SellerConnectStatusResponse } from '../api/stripeConnectRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import type { SellerReloadOptions } from './sellerReloadOptions';

export function useSellerStripeConnect(accessToken: string | undefined) {
  const [status, setStatus] = useState<SellerConnectStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const refresh = useCallback(
    async (opts?: SellerReloadOptions): Promise<SellerConnectStatusResponse | null> => {
      if (!accessToken) {
        requestRef.current += 1;
        setStatus(null);
        setStatusError(null);
        setLoading(false);
        setRefreshing(false);
        setLoadedOnce(false);
        loadedOnceRef.current = false;
        return null;
      }

      const requestId = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);

      const { status: s, error } = await fetchSellerConnectStatus(accessToken);
      if (requestId !== requestRef.current) return s;

      setStatus((prev) => {
        if (s) return s;
        if (error && prev?.stripe_account_id?.trim()) return prev;
        return s;
      });
      setStatusError(error);
      setLoadedOnce(true);
      loadedOnceRef.current = true;

      if (silent) setRefreshing(false);
      else setLoading(false);
      return s;
    },
    [accessToken],
  );

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void refresh();
    }, 900);
    return () => task.cancel();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh({ silent: true });
    });
    return () => sub.remove();
  }, [refresh]);

  return { status, statusError, loading, refreshing, loadedOnce, refresh };
}
