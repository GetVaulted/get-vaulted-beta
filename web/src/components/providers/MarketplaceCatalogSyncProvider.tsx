"use client";

import { useMarketplaceCatalogSync } from "@/hooks/useMarketplaceCatalogSync";

/** Public marketplace catalog sync (guests + signed-in). Refreshes browse/home/seller shop grids. */
export function MarketplaceCatalogSyncProvider({ children }: { children: React.ReactNode }) {
  useMarketplaceCatalogSync();
  return <>{children}</>;
}
