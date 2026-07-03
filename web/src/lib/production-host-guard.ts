/**
 * Beta and production currently share one Supabase project/database (see
 * web/docs/production-launch-config.md), so a Supabase project-ref allowlist alone CANNOT tell a
 * destructive "beta-only" script apart from production — both resolve to the same ref.
 *
 * The one signal that reliably differs between the two Netlify contexts is the site host
 * (`NEXT_PUBLIC_SITE_URL` / `NEXTAUTH_URL` / `SITE_URL`): production is the bare apex domain,
 * beta is the `beta.` subdomain. Any destructive beta-only script MUST check this first, before
 * touching the database, and refuse outright if it looks like a production host — regardless of
 * what the DB/Supabase project ref checks say.
 */

export const PRODUCTION_APEX_HOST = "shopgetvaulted.com";
export const BETA_HOST = "beta.shopgetvaulted.com";

function hostnameOf(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}

/** True when a URL/host string points at the live apex production domain (not beta/preview/local). */
export function isProductionSiteUrl(raw: string | null | undefined): boolean {
  const host = hostnameOf(raw ?? "");
  if (!host) return false;
  return host === PRODUCTION_APEX_HOST || host === `www.${PRODUCTION_APEX_HOST}`;
}

const SITE_URL_ENV_VARS = ["NEXT_PUBLIC_SITE_URL", "NEXTAUTH_URL", "SITE_URL"] as const;

/**
 * Scans known site-URL env vars for a production-host match.
 * Returns the offending var name (for a clear error message), or null if none match.
 */
export function findProductionHostEnvVar(
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const key of SITE_URL_ENV_VARS) {
    if (isProductionSiteUrl(env[key])) return key;
  }
  return null;
}
