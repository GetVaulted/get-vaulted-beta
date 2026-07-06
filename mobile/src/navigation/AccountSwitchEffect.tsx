import { useResetStateOnAccountSwitch } from '../auth/useResetStateOnAccountSwitch';
import { clearLiveStreamPrefetchCache } from '../lib/liveStreamPrefetchCache';

/**
 * Defensive, provider-independent cross-account cleanup: clears in-memory caches that live outside
 * any React context when a different user signs in without the app being force-quit. The primary,
 * immediate clearing for a normal sign-out happens in `performSignOut` — see `signOutSession.ts`.
 */
export function AccountSwitchEffect() {
  useResetStateOnAccountSwitch(clearLiveStreamPrefetchCache);
  return null;
}
