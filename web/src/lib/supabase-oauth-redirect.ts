import { safeReturnTo } from "@/lib/safe-return-to";

/** OAuth callback path on the web app (must be allowlisted in Supabase Auth). */
export const WEB_OAUTH_CALLBACK_PATH = "/auth/callback";

/** Mobile in-app browser return page (must be allowlisted in Supabase Auth). */
export const MOBILE_OAUTH_CALLBACK_PATH = "/mobile/auth/callback";

/** Exact callback URL for Supabase `redirectTo` (no query string — must match dashboard allowlist). */
export function buildWebOAuthCallbackOrigin(origin?: string): string {
  const base = (origin ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${WEB_OAUTH_CALLBACK_PATH}`;
}

/** @deprecated Prefer `buildWebOAuthCallbackOrigin` + return-to cookie for Supabase allowlist matching. */
export function buildWebOAuthCallbackUrl(returnTo?: string | null, origin?: string): string {
  const rt = safeReturnTo(returnTo);
  const qs = new URLSearchParams({ returnTo: rt });
  return `${buildWebOAuthCallbackOrigin(origin)}?${qs.toString()}`;
}

export function buildMobileOAuthCallbackUrl(siteUrl?: string | null): string {
  const base = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}${MOBILE_OAUTH_CALLBACK_PATH}`;
}

/** Documented Supabase redirect allowlist entries (see web/docs/social-auth-setup.md). */
export const SUPABASE_OAUTH_REDIRECT_ALLOWLIST = [
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/auth/callback/**",
  "http://127.0.0.1:3000/auth/callback",
  "http://127.0.0.1:3000/auth/callback/**",
  "https://beta.shopgetvaulted.com/auth/callback",
  "https://beta.shopgetvaulted.com/auth/callback/**",
  "https://shopgetvaulted.com/auth/callback",
  "https://www.shopgetvaulted.com/auth/callback",
  "http://localhost:3000/mobile/auth/callback",
  "https://beta.shopgetvaulted.com/mobile/auth/callback",
  "https://shopgetvaulted.com/mobile/auth/callback",
  "getvaulted://auth/callback",
] as const;
