import { fetchWebApiMobile } from './fetchWebApiMobile';
import { recoverFromStaleAuthSession } from './recoverInvalidAuthSession';
import {
  isAlreadyUsedRefreshTokenError,
  isInvalidRefreshTokenError,
} from './recoverInvalidAuthSessionErrors';
import { ensureSupabaseReady, getSupabase } from './supabase';

/** Refresh access tokens this many seconds before Supabase marks them expired. */
const REFRESH_BUFFER_SEC = 120;

/** Shared in-flight refresh so concurrent 401s / expiry checks don't burn a single-use token twice. */
let refreshInFlight: Promise<string | null> | null = null;

function accessTokenStillFresh(expiresAt: number | undefined): boolean {
  if (!expiresAt) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return expiresAt > nowSec + REFRESH_BUFFER_SEC;
}

/**
 * One refresh at a time. On "Already Used" (race with another refresh), re-read the
 * session instead of treating it as a dead login.
 */
async function refreshSupabaseAccessTokenSingleFlight(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    await ensureSupabaseReady();
    const sb = getSupabase();
    if (!sb) return null;

    const refreshed = await sb.auth.refreshSession();
    if (!refreshed.error) {
      return refreshed.data.session?.access_token?.trim() ?? null;
    }

    // Concurrent refresh already rotated the token — use whatever session won.
    if (isAlreadyUsedRefreshTokenError(refreshed.error)) {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token?.trim() ?? null;
    }

    if (isInvalidRefreshTokenError(refreshed.error)) {
      await recoverFromStaleAuthSession({ navigate: false });
      return null;
    }

    const { data } = await sb.auth.getSession();
    return data.session?.access_token?.trim() ?? null;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function refreshSupabaseSessionIfNeeded(): Promise<string | null> {
  await ensureSupabaseReady();
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getSession();
  if (error) {
    if (isAlreadyUsedRefreshTokenError(error)) {
      const again = await sb.auth.getSession();
      return again.data.session?.access_token?.trim() ?? null;
    }
    if (isInvalidRefreshTokenError(error)) {
      await recoverFromStaleAuthSession({ navigate: false });
      throw new Error('Your session expired. Sign in again to continue.');
    }
    return null;
  }

  const session = data.session;
  if (!session?.access_token?.trim()) return null;

  if (accessTokenStillFresh(session.expires_at)) {
    return session.access_token.trim();
  }

  const token = await refreshSupabaseAccessTokenSingleFlight();
  if (token) return token;

  // Refresh failed without wiping — fall back to the still-valid access token if present.
  return session.access_token.trim();
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
  options?: { timeoutMs?: number },
): Promise<Response> {
  const token = await resolveSellerAccessToken(accessToken);
  const buildHeaders = (bearer: string) => ({
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${bearer}`,
    ...init?.headers,
  });

  let res = await fetchWebApiMobile(path, { ...init, headers: buildHeaders(token) }, options);
  if (res.status !== 401) return res;

  await ensureSupabaseReady();
  const sb = getSupabase();
  if (!sb) return res;

  // Cookie-only / miswired APIs return 401 even with a valid Bearer. Don't burn a
  // refresh token (or race auto-refresh) when the access token is still fresh.
  const { data: sessionData } = await sb.auth.getSession();
  if (accessTokenStillFresh(sessionData.session?.expires_at)) {
    return res;
  }

  const refreshedToken = await refreshSupabaseAccessTokenSingleFlight();
  if (!refreshedToken) return res;

  return fetchWebApiMobile(
    path,
    {
      ...init,
      headers: buildHeaders(refreshedToken),
    },
    options,
  );
}
