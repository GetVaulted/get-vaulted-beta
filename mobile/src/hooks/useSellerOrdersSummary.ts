import { useCallback, useEffect, useState } from 'react';
import { fetchSellerSalesOrders, type SellerSalesOrderRow } from '../api/sellerSalesRepository';

/** Seller orders from the same `/api/account/sales` endpoint used by web Seller Studio. */
export function useSellerOrdersSummary(accessToken: string | undefined) {
  const [orders, setOrders] = useState<SellerSalesOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setOrders([]);
      setLoadedOnce(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchSellerSalesOrders(accessToken);
      setOrders(rows);
      setLoadedOnce(true);
    } catch {
      if (!loadedOnce) setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadedOnce]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { orders, loading, loadedOnce, reload };
}
