/** Shared reload options for Seller HQ data hooks (stale-while-revalidate). */
export type SellerReloadOptions = {
  /** Keep existing UI visible while refetching (focus, poll, realtime). Never drives RefreshControl. */
  silent?: boolean;
  /** Bypass in-memory cache and fetch fresh rows from the API. */
  force?: boolean;
};
