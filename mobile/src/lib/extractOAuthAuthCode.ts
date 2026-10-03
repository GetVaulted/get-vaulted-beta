/**
 * Supabase `exchangeCodeForSession` expects the bare auth code, not the full redirect URL.
 * Passing `getvaulted://auth/callback?code=…` causes: "invalid flow state, no valid flow state found".
 */
export function extractOAuthAuthCode(urlOrCode: string): string | null {
  const raw = urlOrCode.trim();
  if (!raw) return null;

  // Already a bare code (Supabase auth codes look like UUIDs).
  if (!/[/?#&=]/.test(raw)) {
    return raw.length >= 8 ? raw : null;
  }

  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get('code')?.trim();
    if (fromQuery) return fromQuery;
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const fromHash = hash.get('code')?.trim();
      if (fromHash) return fromHash;
    }
  } catch {
    /* custom schemes can fail on older URL parsers — fall through */
  }

  const match = raw.match(/[?&#]code=([^&]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}
