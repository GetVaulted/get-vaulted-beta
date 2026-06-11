import { useCallback, useRef } from 'react';
import type { SellerReloadOptions } from './useSellerOrdersSummary';
import { useMoneyStateSync } from './useMoneyStateSync';

type ReloadFn = (opts?: SellerReloadOptions) => void | Promise<void>;

type Options = {
  enabled?: boolean;
  accessToken?: string;
  canonicalUserId?: string;
  supabaseUserId?: string;
  reloadOrders: ReloadFn;
  reloadLayaways: ReloadFn;
  reloadAnalytics?: () => void | Promise<void>;
  pollIntervalMs?: number;
};

const REFETCH_DEBOUNCE_MS = 300;

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void reloadOrders({ silent: true });
      void reloadLayaways({ silent: true });
      void reloadAnalytics?.();
    }, REFETCH_DEBOUNCE_MS);
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
