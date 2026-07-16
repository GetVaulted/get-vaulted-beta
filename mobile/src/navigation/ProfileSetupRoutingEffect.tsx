import { CommonActions } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchProfileSetupStatus } from '../api/profileSetupRepository';
import { rootNavigationRef } from './rootNavigationRef';

/**
 * After OAuth sign-in, members must confirm a username (and optional referral) before using the app.
 *
 * Also re-asserts that route if something else (e.g. a post-login Home reset) navigates away
 * before setup is finished — without trapping users who just completed setup.
 */
export function ProfileSetupRoutingEffect() {
  const { user, session, loading, guestExploreMode } = useAuth();
  const cacheRef = useRef<{ userId: string; needsSetup: boolean } | null>(null);
  const inFlightRef = useRef(false);

  const enforceSetupRoute = useCallback(async () => {
    if (loading || guestExploreMode || !user?.id || !session?.access_token) return;
    if (!rootNavigationRef.isReady()) return;
    if (inFlightRef.current) return;

    const route = rootNavigationRef.getCurrentRoute()?.name;
    if (route === 'CompleteProfileSetup') return;

    const cached = cacheRef.current?.userId === user.id ? cacheRef.current : null;

    inFlightRef.current = true;
    try {
      // Fresh check when cache is missing, or when leaving setup / landing on Home while
      // cache still thinks setup is required (covers "just completed" vs "raced away").
      const shouldRefresh = !cached || cached.needsSetup;
      if (!shouldRefresh) return;

      const status = await fetchProfileSetupStatus(session.access_token);
      cacheRef.current = { userId: user.id, needsSetup: status.needsSetup };
      if (!status.needsSetup) return;
      if (!rootNavigationRef.isReady()) return;
      if (rootNavigationRef.getCurrentRoute()?.name === 'CompleteProfileSetup') return;

      rootNavigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'CompleteProfileSetup' }],
        }),
      );
    } catch {
      // Transient API errors should not trap the user; setup screen can still be opened manually.
    } finally {
      inFlightRef.current = false;
    }
  }, [guestExploreMode, loading, session?.access_token, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      cacheRef.current = null;
      return;
    }
    void enforceSetupRoute();
  }, [enforceSetupRoute, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = rootNavigationRef.addListener('state', () => {
      void enforceSetupRoute();
    });
    return unsub;
  }, [enforceSetupRoute, user?.id]);

  return null;
}
