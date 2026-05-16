/**
 * Base URL for Next.js API routes (same host as marketing site unless overridden).
 * Set EXPO_PUBLIC_WEB_API_URL if APIs live on a different origin.
 */
export function getWebApiBaseUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_WEB_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const site = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, '');
  return null;
}
