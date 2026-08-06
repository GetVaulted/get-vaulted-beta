import { describe, expect, it } from 'vitest';
import {
  isStickyLiveSignedIn,
  resolveStickyLiveAuth,
  stickyLiveAccessToken,
  stickyLiveUserId,
} from './liveAuthStickiness';

const sticky = { userId: 'u1', accessToken: 'tok-old' };

describe('liveAuthStickiness', () => {
  it('updates sticky when session is present', () => {
    expect(
      resolveStickyLiveAuth({
        userId: 'u2',
        accessToken: 'tok-new',
        lastAuthEvent: 'TOKEN_REFRESHED',
        previousSticky: sticky,
      }),
    ).toEqual({
      sticky: { userId: 'u2', accessToken: 'tok-new' },
      armGraceClear: false,
    });
  });

  it('holds previous sticky during a transient null session', () => {
    expect(
      resolveStickyLiveAuth({
        userId: null,
        accessToken: null,
        lastAuthEvent: 'TOKEN_REFRESHED',
        previousSticky: sticky,
      }),
    ).toEqual({ sticky, armGraceClear: true });
  });

  it('clears sticky immediately on SIGNED_OUT', () => {
    expect(
      resolveStickyLiveAuth({
        userId: null,
        accessToken: null,
        lastAuthEvent: 'SIGNED_OUT',
        previousSticky: sticky,
      }),
    ).toEqual({ sticky: null, armGraceClear: false });
  });

  it('does not invent sticky for never-signed-in users', () => {
    expect(
      resolveStickyLiveAuth({
        userId: null,
        accessToken: null,
        lastAuthEvent: null,
        previousSticky: null,
      }),
    ).toEqual({ sticky: null, armGraceClear: false });
  });

  it('exposes sticky signed-in / token / userId helpers', () => {
    expect(isStickyLiveSignedIn({ userId: null, sticky })).toBe(true);
    expect(isStickyLiveSignedIn({ userId: null, sticky: null })).toBe(false);
    expect(stickyLiveAccessToken({ accessToken: null, sticky })).toBe('tok-old');
    expect(stickyLiveAccessToken({ accessToken: 'tok-live', sticky })).toBe('tok-live');
    expect(stickyLiveUserId({ userId: null, sticky })).toBe('u1');
    expect(stickyLiveUserId({ userId: 'u9', sticky })).toBe('u9');
  });
});
