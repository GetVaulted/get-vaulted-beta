import { useCallback, useRef } from 'react';
import type { SellerReloadOptions } from './sellerReloadOptions';
import { useMoneyStateSync } from './useMoneyStateSync';

type ReloadFn = (opts?: SellerReloadOptions) => void | Promise<unknown>;

type Options = {
  enabled?: boolean;
  canonicalUserId?: string;
  supabaseUserId?: string;
  userId?: string;
  reloadOrders: ReloadFn;
  reloadLayaways: ReloadFn;
  reloadAnalytics?: (userId: string) => void | Promise<void>;
  reloadRooms?: ReloadFn;
  reloadInventory?: ReloadFn;
  reloadWallet?: ReloadFn;
  reloadConnect?: ReloadFn;
  reloadLiveReadiness?: ReloadFn;
  reloadLiveOrders?: ReloadFn;
  pollIntervalMs?: number;
};

const REFETCH_DEBOUNCE_MS = 300;

/** Debounced silent refresh for all Seller HQ tabs (orders, events, wallet, listings, overview). */
export function useSellerHQSync({
  enabled = true,
  canonicalUserId,
  supabaseUserId,
  userId,
  reloadOrders,
  reloadLayaways,
  reloadAnalytics,
  reloadRooms,
  reloadInventory,
  reloadWallet,
  reloadConnect,
  reloadLiveReadiness,
  reloadLiveOrders,
  pollIntervalMs,
}: Options): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void reloadOrders({ silent: true });
      void reloadLayaways({ silent: true });
      if (userId) void reloadAnalytics?.(userId);
      void reloadRooms?.({ silent: true });
      void reloadInventory?.({ silent: true });
      void reloadWallet?.({ silent: true });
      void reloadConnect?.({ silent: true });
      void reloadLiveReadiness?.({ silent: true });
      void reloadLiveOrders?.({ silent: true });
    }, REFETCH_DEBOUNCE_MS);
  }, [
    reloadAnalytics,
    reloadConnect,
    reloadInventory,
    reloadLayaways,
    reloadLiveOrders,
    reloadLiveReadiness,
    reloadOrders,
    reloadRooms,
    reloadWallet,
    userId,
  ]);

  useMoneyStateSync({
    enabled,
    canonicalUserId,
    supabaseUserId,
    refetch: refetchAll,
    pollIntervalMs,
    refetchOnFocus: true,
  });
}

/** @deprecated Use useSellerHQSync — kept as alias for commerce-only call sites. */
export const useSellerCommerceSync = useSellerHQSync;
