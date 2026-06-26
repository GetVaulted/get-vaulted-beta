import { fetchWebApiMobile } from './fetchWebApiMobile';
import { recoverFromStaleAuthSession } from './recoverInvalidAuthSession';
import { isInvalidRefreshTokenError } from './recoverInvalidAuthSessionErrors';
import { ensureSupabaseReady, getSupabase } from './supabase';

/** Refresh access tokens this many seconds before Supabase marks them expired. */
const REFRESH_BUFFER_SEC = 120;

async function refreshSupabaseSessionIfNeeded(): Promise<string | null> {
  await ensureSupabaseReady();
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getSession();
  if (error) {
    if (isInvalidRefreshTokenError(error)) {
      await recoverFromStaleAuthSession({ navigate: false });
      throw new Error('Your session expired. Sign in again to continue.');
    }
    return null;
  }

  let session = data.session;
  if (!session?.access_token?.trim()) return null;

  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt > nowSec + REFRESH_BUFFER_SEC) {
    return session.access_token.trim();
  }

  const refreshed = await sb.auth.refreshSession();
  if (refreshed.error) {
    if (isInvalidRefreshTokenError(refreshed.error)) {
      await recoverFromStaleAuthSession({ navigate: false });
      throw new Error('Your session expired. Sign in again to continue.');
    }
    return session.access_token.trim();
  }

  session = refreshed.data.session ?? session;
  return session?.access_token?.trim() ?? null;
}

/** Prefer a fresh Supabase access token over a possibly stale React prop. */
export async function resolveSellerAccessToken(fallback?: string): Promise<string> {
  const fresh = await refreshSupabaseSessionIfNeeded();
  if (fresh) return fresh;

  const trimmed = fallback?.trim();
  if (trimmed) return trimmed;

  throw new Error('Sign in to continue.');
}

/** Mobile → Next.js API fetch with session refresh + one 401 retry. */
export async function fetchWebApiMobileWithSellerAuth(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await resolveSellerAccessToken(accessToken);
  const buildHeaders = (bearer: string) => ({
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${bearer}`,
    ...init?.headers,
  });

  let res = await fetchWebApiMobile(path, { ...init, headers: buildHeaders(token) });
  if (res.status !== 401) return res;

  await ensureSupabaseReady();
  const sb = getSupabase();
  if (!sb) return res;

  const refreshed = await sb.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token?.trim()) {
    if (isInvalidRefreshTokenError(refreshed.error)) {
      await recoverFromStaleAuthSession({ navigate: false });
    }
    return res;
  }

  return fetchWebApiMobile(path, {
    ...init,
    headers: buildHeaders(refreshed.data.session.access_token.trim()),
  });
}
