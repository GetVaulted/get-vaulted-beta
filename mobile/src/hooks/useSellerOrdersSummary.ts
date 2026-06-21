import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSellerSalesOrders, type SellerSalesOrderRow } from '../api/sellerSalesRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import type { SellerReloadOptions } from './sellerReloadOptions';

export type { SellerReloadOptions };

/** Seller orders from the same `/api/account/sales` endpoint used by web Seller Studio. */
export function useSellerOrdersSummary(accessToken: string | undefined) {
  const [orders, setOrders] = useState<SellerSalesOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const reload = useCallback(async (opts?: SellerReloadOptions) => {
    if (!accessToken) {
      requestRef.current += 1;
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      setLoadedOnce(false);
      loadedOnceRef.current = false;
      return;
    }

    const requestId = ++requestRef.current;
    const silent = opts?.silent ?? loadedOnceRef.current;
    if (!silent) setLoading(true);

    try {
      const rows = await fetchSellerSalesOrders(accessToken);
      if (requestId !== requestRef.current) return;
      setOrders(rows);
      setLoadedOnce(true);
      loadedOnceRef.current = true;
    } catch {
      if (requestId !== requestRef.current) return;
      if (!loadedOnceRef.current) setOrders([]);
    } finally {
      if (requestId !== requestRef.current) return;
      setLoadedOnce(true);
      loadedOnceRef.current = true;
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void reload();
    }, 700);
    return () => task.cancel();
  }, [reload]);

  return { orders, loading, refreshing, loadedOnce, reload };
}
