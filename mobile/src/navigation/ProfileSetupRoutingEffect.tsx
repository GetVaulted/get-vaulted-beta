import { CommonActions } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchProfileSetupStatus } from '../api/profileSetupRepository';
import { rootNavigationRef } from './rootNavigationRef';

/**
 * After OAuth sign-in, members must confirm a username (and optional referral) before using the app.
 */
export function ProfileSetupRoutingEffect() {
  const { user, session, loading, guestExploreMode } = useAuth();
  const lastCheckedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (loading || guestExploreMode || !user?.id || !session?.access_token) return;
    if (lastCheckedUserId.current === user.id) return;

    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchProfileSetupStatus(session.access_token);
        if (cancelled) return;
        lastCheckedUserId.current = user.id;
        if (!status.needsSetup) return;
        if (!rootNavigationRef.isReady()) return;
        const route = rootNavigationRef.getCurrentRoute()?.name;
        if (route === 'CompleteProfileSetup') return;
        rootNavigationRef.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'CompleteProfileSetup' }],
          }),
        );
      } catch {
        // Transient API errors should not trap the user; setup screen can still be opened manually.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guestExploreMode, loading, session?.access_token, user?.id]);

  useEffect(() => {
    if (!user?.id) lastCheckedUserId.current = null;
  }, [user?.id]);

  return null;
}
