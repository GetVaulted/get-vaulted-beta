import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { clearAuthStore } from './authSessionStorage';
import { clearHomeFeedCache } from './homeFeedCache';
import { setLiveDiscoveryMeta } from './liveDiscoveryMeta';
import { getSupabase } from './supabase';
import { isInvalidRefreshTokenError } from './recoverInvalidAuthSessionErrors';

export { isInvalidRefreshTokenError } from './recoverInvalidAuthSessionErrors';

let recoveryInFlight: Promise<void> | null = null;

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
