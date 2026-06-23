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

export function buildWebApiUrl(path: string): {
  base: string | null;
  path: string;
  url: string | null;
} {
  const base = getWebApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return {
    base,
    path: normalizedPath,
    url: base ? `${base}${normalizedPath}` : null,
  };
}

/** Warn when env points at a host that cannot serve Next.js /api routes. */
export function misconfiguredWebApiHostWarning(base: string | null): string | null {
  if (!base) return 'EXPO_PUBLIC_SITE_URL (or EXPO_PUBLIC_WEB_API_URL) is not set.';
  try {
    const parsed = new URL(base);
    if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname.length > 1) {
      return 'EXPO_PUBLIC_SITE_URL must be the site origin only (no /api or other path suffix).';
    }
    if (base.includes('/.netlify/functions')) {
      return 'EXPO_PUBLIC_WEB_API_URL must be the Next.js site origin, not the Netlify Functions base URL.';
    }
  } catch {
    return 'EXPO_PUBLIC_SITE_URL is not a valid URL.';
  }
  return null;
}
