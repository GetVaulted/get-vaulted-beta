import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { didAccountSwitch } from './accountSwitchDetection';

/**
 * Calls `onAccountSwitch` when a DIFFERENT signed-in user appears after a previously signed-in
 * user on this same app instance — the classic "log out, then a different account logs in without
 * force-quitting" cross-account data leak scenario.
 *
 * This is a secondary/defensive layer: the primary, immediate clearing for a normal sign-out
 * happens synchronously in `performSignOut` (see `signOutSession.ts`). This hook exists to catch
 * the same class of bug even if some other code path bypasses `performSignOut`, without risking a
 * false-positive reset during a legitimate warm-resume session-recovery blip — see
 * `accountSwitchDetection.ts` for why only consecutive non-null user ids are compared.
 */
export function useResetStateOnAccountSwitch(onAccountSwitch: () => void): void {
  const { user } = useAuth();
  const lastSignedInUserIdRef = useRef<string | null | undefined>(undefined);
  const onAccountSwitchRef = useRef(onAccountSwitch);
  onAccountSwitchRef.current = onAccountSwitch;

  useEffect(() => {
    const nextId = user?.id;
    if (!nextId) return;
    if (didAccountSwitch(lastSignedInUserIdRef.current, nextId)) {
      onAccountSwitchRef.current();
    }
    lastSignedInUserIdRef.current = nextId;
  }, [user?.id]);
}
