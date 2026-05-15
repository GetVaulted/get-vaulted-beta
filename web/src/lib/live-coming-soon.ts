/**
 * Live marketplace gate (Edge + Node safe — env strings only).
 *
 * Live is **off** until `LIVE_MARKETPLACE_ENABLED` is `1`, `true`, or `yes` — in **every** runtime
 * except automated tests (see below). That matches “marketplace first, live later” without remembering
 * a separate dev-only flag.
 *
 * **Vitest (`NODE_ENV === "test"`):** live is treated as **on** unless `LIVE_MARKETPLACE_COMING_SOON=1`,
 * so integration tests do not need `LIVE_MARKETPLACE_ENABLED`.
 *
 * **Kill switch:** `LIVE_MARKETPLACE_COMING_SOON=1` forces live off even if `LIVE_MARKETPLACE_ENABLED` is set.
 *
 * When blocked, middleware redirects `/live`, `/live/*`, `/seller/live/*` → `/coming-soon` and
 * returns 503 for `/api/live-rooms/*` and `/api/seller/live-readiness`.
 */

function envTruthy(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Explicit kill switch in any environment. */
export function isLiveMarketplaceComingSoonForced(): boolean {
  return envTruthy(process.env.LIVE_MARKETPLACE_COMING_SOON);
}

/** Live rooms / APIs are allowed for real users (homepage, nav, middleware inverse). */
export function isLiveMarketplacePubliclyAvailable(): boolean {
  if (isLiveMarketplaceComingSoonForced()) return false;
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  return envTruthy(process.env.LIVE_MARKETPLACE_ENABLED);
}

/** Used by middleware and matches “blocked” APIs. */
export function isLiveMarketplaceBlocked(): boolean {
  return !isLiveMarketplacePubliclyAvailable();
}
