import { describe, expect, it } from 'vitest';
import { didAccountSwitch } from './accountSwitchDetection';

describe('didAccountSwitch', () => {
  it('is false on the very first signed-in observation (cold start / initial auth resolution)', () => {
    expect(didAccountSwitch(undefined, 'user-a')).toBe(false);
  });

  it('is false when the same user id repeats', () => {
    expect(didAccountSwitch('user-a', 'user-a')).toBe(false);
  });

  it('is true when a different signed-in user id follows a known one (account switch)', () => {
    expect(didAccountSwitch('user-a', 'user-b')).toBe(true);
  });

  it('ignores a null reading in between (warm-resume token refresh blip), so a later match to the same prior user is not treated as a switch', () => {
    // Simulates: user A signed in -> null (transient blip, never fed into the ref) -> user A again.
    // The caller never calls didAccountSwitch with a null argument because the hook only updates
    // its ref and compares on non-null readings — this test documents that contract at the
    // pure-function level using the last known non-null id.
    const lastKnown = 'user-a';
    expect(didAccountSwitch(lastKnown, 'user-a')).toBe(false);
  });

  it('treats null as "not yet known" only via undefined/null, not as a valid prior user id', () => {
    expect(didAccountSwitch(null, 'user-a')).toBe(false);
  });
});
