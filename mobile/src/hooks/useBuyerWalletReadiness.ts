import { useCallback, useEffect, useState } from 'react';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
} from '../api/buyerWalletRepository';
import {
  buyerWalletReady,
  type BuyerWalletReadinessSnapshot,
} from '../lib/buyerWalletReadinessDisplay';

export function useBuyerWalletReadiness(accessToken: string | undefined, enabled = true) {
  const [snapshot, setSnapshot] = useState<BuyerWalletReadinessSnapshot>({
    paymentReady: false,
    shippingReady: false,
  });
  const [loading, setLoading] = useState(Boolean(enabled && accessToken));

  const refresh = useCallback(async (): Promise<BuyerWalletReadinessSnapshot> => {
    if (!accessToken) {
      const empty = { paymentReady: false, shippingReady: false };
      setSnapshot(empty);
      setLoading(false);
      return empty;
    }
    setLoading(true);
    try {
      const [pm, addresses] = await Promise.all([
        fetchBuyerPaymentMethods(accessToken),
        fetchBuyerShippingAddresses(accessToken),
      ]);
      const next = {
        paymentReady: pm.paymentMethods.length > 0,
        shippingReady: addresses.length > 0,
      };
      setSnapshot(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    void refresh();
  }, [accessToken, enabled, refresh]);

  return {
    ...snapshot,
    walletReady: buyerWalletReady(snapshot),
    loading,
    refresh,
  };
}
