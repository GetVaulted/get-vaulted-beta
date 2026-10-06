import { useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  isStickyLiveSignedIn,
  LIVE_AUTH_NULL_SESSION_GRACE_MS,
  resolveStickyLiveAuth,
  stickyLiveAccessToken,
  stickyLiveUserId,
  type StickyLiveAuthSnapshot,
} from '../auth/liveAuthStickiness';

/**
 * Live-room auth that survives brief Supabase null-session blips during token refresh.
 * Mirrors AuthSessionRoutingController grace — without this, chat/bid gates flash "Sign in".
 */
export function useStickyLiveAuth(args: {
  user: User | null;
  session: Session | null;
  lastAuthEvent: AuthChangeEvent | null;
}): {
  signedIn: boolean;
  accessToken: string | undefined;
  userId: string | undefined;
} {
  const [sticky, setSticky] = useState<StickyLiveAuthSnapshot | null>(null);
  const stickyRef = useRef(sticky);
  stickyRef.current = sticky;

  useEffect(() => {
    const next = resolveStickyLiveAuth({
      userId: args.user?.id,
      accessToken: args.session?.access_token,
      lastAuthEvent: args.lastAuthEvent,
      previousSticky: stickyRef.current,
    });
    setSticky((prev) => {
      if (prev?.userId === next.sticky?.userId && prev?.accessToken === next.sticky?.accessToken) {
        return prev;
      }
      return next.sticky;
    });

    if (!next.armGraceClear) return;

    const timer = setTimeout(() => {
      setSticky(null);
    }, LIVE_AUTH_NULL_SESSION_GRACE_MS);
    return () => clearTimeout(timer);
  }, [args.user?.id, args.session?.access_token, args.lastAuthEvent]);

  return {
    signedIn: isStickyLiveSignedIn({ userId: args.user?.id, sticky }),
    accessToken: stickyLiveAccessToken({
      accessToken: args.session?.access_token,
      sticky,
    }),
    userId: stickyLiveUserId({ userId: args.user?.id, sticky }),
  };
}
