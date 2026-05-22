/**
 * Live marketplace gate (Edge + Node safe — env strings only).
 *
 * Live is **off** until one of the allow paths below is true (except in tests).
 *
 * **Allow paths**
 * - `LIVE_MARKETPLACE_ENABLED=1` (or `true` / `yes`) — any environment
 * - Deploy host is a configured beta host (default `beta.shopgetvaulted.com`) from Netlify `URL` /
 *   `DEPLOY_PRIME_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, or `SITE_URL`
 * - `LIVE_MARKETPLACE_BETA=1` — force beta-style allow without hostname match
 *
 * **Vitest (`NODE_ENV === "test"`):** live is treated as **on** unless `LIVE_MARKETPLACE_COMING_SOON=1`.
 *
 * **Kill switch:** `LIVE_MARKETPLACE_COMING_SOON=1` forces live off even when otherwise allowed.
 *
 * When blocked, middleware redirects `/live`, `/live/*`, `/seller/live/*` → `/coming-soon` and
 * returns 503 for mutating `/api/live-rooms/*` paths. Public buyer GETs (`/api/live-rooms`, `/api/live-rooms/{id}`)
 * stay available for mobile/web discovery.
 */

const DEFAULT_BETA_LIVE_HOSTS = ["beta.shopgetvaulted.com"];

function envTruthy(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

function hostFromDeployEnvUrl(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const withProto = s.includes("://") ? s : `https://${s}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function betaLiveHosts(): Set<string> {
  const fromEnv = process.env.LIVE_MARKETPLACE_BETA_HOSTS?.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_BETA_LIVE_HOSTS, ...(fromEnv ?? [])]);
}

/** Netlify beta (and similar) without requiring a separate ENABLED flag on that site. */
export function isLiveMarketplaceBetaDeploy(): boolean {
  if (envTruthy(process.env.LIVE_MARKETPLACE_BETA)) return true;
  const allowed = betaLiveHosts();
  const deployHosts = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
    process.env.SITE_URL,
  ]
    .map(hostFromDeployEnvUrl)
    .filter((h): h is string => Boolean(h));
  return deployHosts.some((h) => allowed.has(h));
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
  if (envTruthy(process.env.LIVE_MARKETPLACE_ENABLED)) return true;
  if (isLiveMarketplaceBetaDeploy()) return true;
  return false;
}

/** Used by middleware and matches “blocked” APIs. */
export function isLiveMarketplaceBlocked(): boolean {
  return !isLiveMarketplacePubliclyAvailable();
}
