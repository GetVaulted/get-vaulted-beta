import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchSellerConnectStatus, type SellerConnectStatusResponse } from '../api/stripeConnectRepository';

export function useSellerStripeConnect(accessToken: string | undefined) {
  const [status, setStatus] = useState<SellerConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<SellerConnectStatusResponse | null> => {
    if (!accessToken) {
      setStatus(null);
      return null;
    }
    setLoading(true);
    const s = await fetchSellerConnectStatus(accessToken);
    setStatus(s);
    setLoading(false);
    return s;
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
