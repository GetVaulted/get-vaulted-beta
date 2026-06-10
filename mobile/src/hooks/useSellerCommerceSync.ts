import { useCallback } from 'react';
import { useMoneyStateSync } from './useMoneyStateSync';

type Options = {
  enabled?: boolean;
  accessToken?: string;
  canonicalUserId?: string;
  supabaseUserId?: string;
  reloadOrders: () => void | Promise<void>;
  reloadLayaways: () => void | Promise<void>;
  reloadAnalytics?: () => void | Promise<void>;
  pollIntervalMs?: number;
};

/** Keep Seller HQ orders, layaways, and analytics aligned with the shared web API. */
export function useSellerCommerceSync({
  enabled = true,
  canonicalUserId,
  supabaseUserId,
  reloadOrders,
  reloadLayaways,
  reloadAnalytics,
  pollIntervalMs,
}: Options): void {
  const refetchAll = useCallback(() => {
    void reloadOrders();
    void reloadLayaways();
    void reloadAnalytics?.();
  }, [reloadAnalytics, reloadLayaways, reloadOrders]);

  useMoneyStateSync({
    enabled,
    canonicalUserId,
    supabaseUserId,
    refetch: refetchAll,
    pollIntervalMs,
    refetchOnFocus: true,
  });
}
