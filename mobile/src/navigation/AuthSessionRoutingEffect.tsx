import { useEffect, useRef } from 'react';
import { AuthSessionRoutingController } from '../auth/authSessionRoutingDecision';
import { useAuth } from '../auth/AuthContext';
import { navigateToAuthWelcome } from './rootNavigationRef';

/**
 * When session ends while the main app was active, return the user to the auth hub.
 *
 * Routing decisions are delegated to `AuthSessionRoutingController`, which only navigates away
 * immediately on a confirmed `SIGNED_OUT` event and otherwise gives an ambiguous `user === null`
 * reading (e.g. a transient blip during a warm-resume token refresh) a short grace window to
 * resolve itself before concluding it's a real logout — see `authSessionRoutingDecision.ts`.
 */
export function AuthSessionRoutingEffect() {
  const { user, loading, lastAuthEvent } = useAuth();
  const controllerRef = useRef<AuthSessionRoutingController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AuthSessionRoutingController({ onSignedOut: navigateToAuthWelcome });
  }

  useEffect(() => {
    controllerRef.current?.update(user, loading, lastAuthEvent);
  }, [user, loading, lastAuthEvent]);

  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller?.dispose();
  }, []);

  return null;
}
