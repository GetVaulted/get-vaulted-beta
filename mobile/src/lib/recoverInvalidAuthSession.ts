import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { clearAuthStore } from './authSessionStorage';
import { clearHomeFeedCache } from './homeFeedCache';
import { setLiveDiscoveryMeta } from './liveDiscoveryMeta';
import { getSupabase } from './supabase';

let recoveryInFlight: Promise<void> | null = null;

/** True when Supabase Auth rejects a persisted refresh token (e.g. after beta wipe). */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') {
    const s = error.toLowerCase();
    return s.includes('invalid refresh token') || s.includes('refresh token not found');
  }
  if (typeof error !== 'object') return false;

  const obj = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
  const code = typeof obj.code === 'string' ? obj.code.toLowerCase() : '';

  if (message.includes('invalid refresh token') || message.includes('refresh token not found')) return true;
  if (code === 'refresh_token_not_found' || code === 'invalid_refresh_token') return true;
  if (obj.name === 'AuthApiError' && message.includes('refresh')) return true;

  return false;
}

export type RecoverStaleAuthOptions = {
  /** Attempt Supabase local sign-out before wiping storage (default true). */
  signOut?: boolean;
  /** Reset navigation to the auth welcome stack (default true). */
  navigate?: boolean;
};

/**
 * Clear persisted Supabase tokens and app session caches after a dead refresh token.
 * Safe to call repeatedly; concurrent calls share one in-flight recovery.
 */
export async function recoverFromStaleAuthSession(options: RecoverStaleAuthOptions = {}): Promise<void> {
  const { signOut = true, navigate = true } = options;

  if (!recoveryInFlight) {
    recoveryInFlight = (async () => {
      const sb = getSupabase();
      if (signOut && sb) {
        try {
          await sb.auth.signOut({ scope: 'local' });
        } catch {
          /* server may reject sign-out when refresh token is already gone */
        }
      }
      try {
        await clearAuthStore();
      } catch {
        /* ignore */
      }
      try {
        await clearHomeFeedCache();
      } catch {
        /* ignore */
      }
      setLiveDiscoveryMeta({ source: 'none', fetchedAt: null, apiBaseUrl: null, error: null });
    })().finally(() => {
      recoveryInFlight = null;
    });
  }

  await recoveryInFlight;

  if (navigate) {
    const { navigateToAuthWelcome } = await import('../navigation/rootNavigationRef');
    navigateToAuthWelcome();
  }
}

/** Boot-time session read with graceful recovery when stored refresh tokens are invalid. */
export async function resolveInitialAuthSession(
  sb: SupabaseClient,
): Promise<{ session: Session | null; recoveredStaleSession: boolean }> {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error && isInvalidRefreshTokenError(error)) {
      await recoverFromStaleAuthSession({ navigate: false });
      return { session: null, recoveredStaleSession: true };
    }
    if (error) return { session: null, recoveredStaleSession: false };
    return { session: data.session ?? null, recoveredStaleSession: false };
  } catch (err) {
    if (isInvalidRefreshTokenError(err)) {
      await recoverFromStaleAuthSession({ navigate: false });
      return { session: null, recoveredStaleSession: true };
    }
    throw err;
  }
}
