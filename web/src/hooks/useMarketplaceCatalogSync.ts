"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  MARKETPLACE_CATALOG_CHANNEL,
  MARKETPLACE_CATALOG_EVENT,
  MARKETPLACE_CATALOG_WINDOW_EVENT,
} from "@/lib/marketplace-catalog-realtime";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";

const CATALOG_POLL_MS = 45_000;

function dispatchCatalogRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MARKETPLACE_CATALOG_WINDOW_EVENT));
}

/**
 * Global marketplace catalog sync: Supabase broadcast (all visitors) + periodic poll while tab is visible.
 * Seller shop pages are server-rendered; `router.refresh()` picks up new listings on the same channel.
 */
export function useMarketplaceCatalogSync(): void {
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(() => {
    dispatchCatalogRefresh();
    if (pathname?.startsWith("/seller/")) {
      router.refresh();
    }
  }, [pathname, router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(MARKETPLACE_CATALOG_CHANNEL)
      .on("broadcast", { event: MARKETPLACE_CATALOG_EVENT }, () => refresh());

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, CATALOG_POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [refresh]);
}
