import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerWalletSummary, type SellerWalletSummary } from '../api/stripeConnectRepository';

export function useSellerWallet(accessToken: string | undefined) {
  const [wallet, setWallet] = useState<SellerWalletSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<SellerWalletSummary | null> => {
    if (!accessToken) {
      setWallet(null);
      return null;
    }
    setLoading(true);
    const w = await fetchSellerWalletSummary(accessToken);
    setWallet(w);
    setLoading(false);
    return w;
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { wallet, loading, refresh };
}
