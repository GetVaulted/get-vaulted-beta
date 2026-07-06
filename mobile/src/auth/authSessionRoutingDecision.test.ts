import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_NULL_SESSION_GRACE_MS, AuthSessionRoutingController } from './authSessionRoutingDecision';

type FakeUser = { id: string };
const USER: FakeUser = { id: 'user-1' };

describe('AuthSessionRoutingController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not navigate away while auth is still loading', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(null, true, null);
    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS + 1000);

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('does nothing when the user was never signed in (guest / cold start with no session)', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(null, false, null);
    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS + 1000);

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('regression: a transient null-session blip during warm resume does NOT navigate to login', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    // User was signed in...
    controller.update(USER as never, false, 'SIGNED_IN');
    // ...app backgrounded and resumed; Supabase momentarily reports a null session with no
    // (or a non-SIGNED_OUT) event while the token refresh is still in flight.
    controller.update(null, false, 'TOKEN_REFRESHED');
    // Before the grace window elapses, the session comes back.
    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS / 2);
    controller.update(USER as never, false, 'TOKEN_REFRESHED');
    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS * 2);

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('an explicit SIGNED_OUT event routes to login immediately, without waiting for the grace window', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(USER as never, false, 'SIGNED_IN');
    controller.update(null, false, 'SIGNED_OUT');

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('a null session that never recovers still routes to login once the grace window elapses', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(USER as never, false, 'SIGNED_IN');
    controller.update(null, false, null);

    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS - 1);
    expect(onSignedOut).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('confirmSignedOut() short-circuits the grace window for a confirmed-unrecoverable session', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(USER as never, false, 'SIGNED_IN');
    controller.update(null, false, null);
    controller.confirmSignedOut();

    expect(onSignedOut).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS + 1000);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('does not schedule duplicate timers for repeated ambiguous null updates', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(USER as never, false, 'SIGNED_IN');
    controller.update(null, false, null);
    controller.update(null, false, null);
    controller.update(null, false, null);

    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS + 1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('dispose() cancels a pending grace-window timer', () => {
    const onSignedOut = vi.fn();
    const controller = new AuthSessionRoutingController({ onSignedOut });

    controller.update(USER as never, false, 'SIGNED_IN');
    controller.update(null, false, null);
    controller.dispose();

    vi.advanceTimersByTime(AUTH_NULL_SESSION_GRACE_MS + 1000);
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
