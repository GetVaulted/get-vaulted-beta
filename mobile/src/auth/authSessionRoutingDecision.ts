import type { AuthChangeEvent, User } from '@supabase/supabase-js';

/**
 * How long an ambiguous `user === null` reading is allowed to self-resolve (e.g. a warm-resume
 * Supabase token refresh completing a moment later) before we treat it as a real sign-out and
 * bounce the user back to the auth welcome screen.
 */
export const AUTH_NULL_SESSION_GRACE_MS = 2500;

export type AuthSessionRoutingControllerDeps = {
  /** Called once we're confident the user is actually signed out. */
  onSignedOut: () => void;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Decides when a `user === null` reading from `AuthContext` really means "signed out" versus a
 * transient blip during a warm-resume Supabase `autoRefreshToken` cycle.
 *
 * Root cause: on app resume from background, Supabase can momentarily report a null session while
 * a token refresh is still in flight. The previous implementation (`AuthSessionRoutingEffect`)
 * treated any `user === null` while a user had previously been signed in as a definite logout and
 * immediately reset navigation to the login screen — even though the session was still valid.
 *
 * Fix: only navigate away immediately when Supabase's `onAuthStateChange` explicitly reports a
 * `SIGNED_OUT` event. Any other null reading (no event, or an event we don't recognize as a real
 * sign-out) gets a short grace window — if `user` becomes non-null again before the window elapses
 * (the normal case for a transient blip), nothing happens. If it's still null once the window
 * elapses, we conclude it really was a logout and navigate away then, so a real-but-unusually-slow
 * sign-out still always ends up routing to the login screen, just with a short bounded delay.
 */
export class AuthSessionRoutingController {
  private hadUser = false;
  private pendingTimer: unknown = null;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onSignedOut: () => void;

  constructor(deps: AuthSessionRoutingControllerDeps) {
    this.onSignedOut = deps.onSignedOut;
    this.setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));
  }

  private clearPendingTimer(): void {
    if (this.pendingTimer != null) {
      this.clearTimer(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  /** Call whenever `user`, `loading`, or the last auth event change. */
  update(user: User | null, loading: boolean, lastAuthEvent: AuthChangeEvent | null | undefined): void {
    if (loading) return;

    if (user) {
      this.hadUser = true;
      this.clearPendingTimer();
      return;
    }

    // Never signed in during this app session — nothing to bounce away from (e.g. guest browsing,
    // or a genuine cold-start with no stored session at all).
    if (!this.hadUser) return;

    if (lastAuthEvent === 'SIGNED_OUT') {
      this.clearPendingTimer();
      this.hadUser = false;
      this.onSignedOut();
      return;
    }

    if (this.pendingTimer != null) return; // already waiting out a grace window
    this.pendingTimer = this.setTimer(() => {
      this.pendingTimer = null;
      if (!this.hadUser) return;
      this.hadUser = false;
      this.onSignedOut();
    }, AUTH_NULL_SESSION_GRACE_MS);
  }

  /** Escape hatch for a confirmed-unrecoverable session (e.g. invalid refresh token) to skip the grace window. */
  confirmSignedOut(): void {
    this.clearPendingTimer();
    if (!this.hadUser) return;
    this.hadUser = false;
    this.onSignedOut();
  }

  dispose(): void {
    this.clearPendingTimer();
  }
}
