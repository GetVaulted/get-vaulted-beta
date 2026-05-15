import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { navigateToAuthWelcome } from './rootNavigationRef';

/** When session ends while the main app was active, return the user to the auth hub. */
export function AuthSessionRoutingEffect() {
  const { user, loading } = useAuth();
  const hadUser = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      hadUser.current = true;
      return;
    }
    if (hadUser.current) {
      navigateToAuthWelcome();
      hadUser.current = false;
    }
  }, [user, loading]);

  return null;
}
