import { useCallback, useEffect, useState } from 'react';
import {
  bucketForOrderStatus,
  fetchBuyerOrdersDetailed,
  isOrderCompleteForReview,
  type BuyerOrder,
  type BuyerOrderBucket,
} from '../api/ordersRepository';
import { hasReviewedReference } from '../platform/platformStore';

export function useBuyerOrders(userId: string | undefined) {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setReviewedMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchBuyerOrdersDetailed(userId);
      setOrders(rows);
      const reviewable = rows.filter((o) => isOrderCompleteForReview(o.status));
      const entries = await Promise.all(
        reviewable.map(async (o) => {
          const done = await hasReviewedReference(userId, o.id, 'buyer_to_seller');
          return [o.id, done] as const;
        }),
      );
      setReviewedMap(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byBucket = (bucket: BuyerOrderBucket): BuyerOrder[] =>
    orders.filter((o) => bucketForOrderStatus(o.status) === bucket);

  return { orders, byBucket, reviewedMap, loading, refresh: load };
}
