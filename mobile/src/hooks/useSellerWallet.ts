import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerWalletSummary, type SellerWalletSummary } from '../api/stripeConnectRepository';
import type { SellerReloadOptions } from './sellerReloadOptions';

export function useSellerWallet(accessToken: string | undefined) {
  const [wallet, setWallet] = useState<SellerWalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const refresh = useCallback(
    async (opts?: SellerReloadOptions): Promise<SellerWalletSummary | null> => {
      if (!accessToken) {
        requestRef.current += 1;
        setWallet(null);
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

      try {
        const w = await fetchSellerWalletSummary(accessToken);
        if (requestId !== requestRef.current) return w;
        setWallet(w);
        setLoadedOnce(true);
        loadedOnceRef.current = true;
        return w;
      } catch {
        if (requestId !== requestRef.current) return null;
        if (!loadedOnceRef.current) setWallet(null);
        return null;
      } finally {
        if (requestId !== requestRef.current) return null;
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh({ silent: true });
    });
    return () => sub.remove();
  }, [refresh]);

  return { wallet, loading, refreshing, loadedOnce, refresh };
}
