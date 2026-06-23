import { useCallback, useEffect, useState } from 'react';
import { fetchBuyerLiveOrders, type BuyerLiveOrder } from '../api/buyerLiveOrdersRepository';
import { useAuth } from '../auth/AuthContext';

export function useBuyerLiveOrders() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token;
  const [orders, setOrders] = useState<BuyerLiveOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !accessToken) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchBuyerLiveOrders(accessToken);
      setOrders(rows);
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { orders, loading, refresh: load };
};
