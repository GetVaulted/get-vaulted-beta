import type { AuthChangeEvent } from '@supabase/supabase-js';
import { AUTH_NULL_SESSION_GRACE_MS } from './authSessionRoutingDecision';

export type StickyLiveAuthSnapshot = {
  userId: string;
  accessToken: string;
};

/**
 * Keep the last known live-room auth snapshot across brief Supabase null-session blips
 * (warm resume / autoRefreshToken). Navigation already grace-buffers these; live chat /
 * bid gates must not treat a single null frame as "Sign in required."
 */
export function resolveStickyLiveAuth(args: {
  userId?: string | null;
  accessToken?: string | null;
  lastAuthEvent?: AuthChangeEvent | null;
  previousSticky: StickyLiveAuthSnapshot | null;
}): {
  sticky: StickyLiveAuthSnapshot | null;
  /** Start/refresh the grace timer that clears sticky if auth stays null. */
  armGraceClear: boolean;
} {
  const userId = args.userId?.trim() || '';
  const accessToken = args.accessToken?.trim() || '';
  if (userId && accessToken) {
    return {
      sticky: { userId, accessToken },
      armGraceClear: false,
    };
  }

  if (args.lastAuthEvent === 'SIGNED_OUT') {
    return { sticky: null, armGraceClear: false };
  }

  if (args.previousSticky?.userId && args.previousSticky.accessToken) {
    return { sticky: args.previousSticky, armGraceClear: true };
  }

  return { sticky: null, armGraceClear: false };
}

export function isStickyLiveSignedIn(args: {
  userId?: string | null;
  sticky: StickyLiveAuthSnapshot | null;
}): boolean {
  return Boolean(args.userId?.trim()) || Boolean(args.sticky?.userId);
}

export function stickyLiveAccessToken(args: {
  accessToken?: string | null;
  sticky: StickyLiveAuthSnapshot | null;
}): string | undefined {
  const live = args.accessToken?.trim();
  if (live) return live;
  const held = args.sticky?.accessToken?.trim();
  return held || undefined;
}

export function stickyLiveUserId(args: {
  userId?: string | null;
  sticky: StickyLiveAuthSnapshot | null;
}): string | undefined {
  const live = args.userId?.trim();
  if (live) return live;
  const held = args.sticky?.userId?.trim();
  return held || undefined;
}

export { AUTH_NULL_SESSION_GRACE_MS as LIVE_AUTH_NULL_SESSION_GRACE_MS };
