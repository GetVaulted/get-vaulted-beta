/** Supabase broadcast channel for public marketplace catalog invalidation (web + mobile). */
export const MARKETPLACE_CATALOG_CHANNEL = "gv-marketplace-catalog";

export const MARKETPLACE_CATALOG_EVENT = "marketplace_catalog_changed";

/** Browser fan-out for client components that refetch listing grids. */
export const MARKETPLACE_CATALOG_WINDOW_EVENT = "gv-listings-updated";
