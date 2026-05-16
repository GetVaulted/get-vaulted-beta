import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerConnectStatus, type SellerConnectStatusResponse } from '../api/stripeConnectRepository';

export function useSellerStripeConnect(accessToken: string | undefined) {
  const [status, setStatus] = useState<SellerConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setStatus(null);
      return;
    }
    setLoading(true);
    const s = await fetchSellerConnectStatus(accessToken);
    setStatus(s);
    setLoading(false);
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

  return { status, loading, refresh };
}
