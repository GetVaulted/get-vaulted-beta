import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (memory.has(key) ? memory.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  },
}));

// eslint-disable-next-line import/order -- must import after vi.mock calls above
import {
  getLastHandledNotificationResponseId,
  lastHandledNotificationResponseKey,
  setLastHandledNotificationResponseId,
  shouldHandleNotificationResponse,
} from './lastHandledNotificationResponse';

// Regression: a cold-start push tap must only ever be acted on once. Expo keeps returning the
// same "last tapped notification" from getLastNotificationResponseAsync() until a genuinely new
// notification is tapped, so every subsequent login/app-resume mount must not re-navigate.
describe('shouldHandleNotificationResponse', () => {
  it('handles the first response ever seen (no prior consumed id)', () => {
    expect(shouldHandleNotificationResponse('resp-1', null)).toBe(true);
    expect(shouldHandleNotificationResponse('resp-1', undefined)).toBe(true);
  });

  it('does not re-handle the same response id on a later mount/login/resume', () => {
    expect(shouldHandleNotificationResponse('resp-1', 'resp-1')).toBe(false);
  });

  it('handles a genuinely new response id that differs from the last consumed one', () => {
    expect(shouldHandleNotificationResponse('resp-2', 'resp-1')).toBe(true);
  });

  it('never handles a missing/empty candidate id', () => {
    expect(shouldHandleNotificationResponse(null, 'resp-1')).toBe(false);
    expect(shouldHandleNotificationResponse(undefined, null)).toBe(false);
    expect(shouldHandleNotificationResponse('', null)).toBe(false);
  });
});

// Regression: the marker used to be stored under a single device-global key, so switching
// accounts on the same device without a force-quit could leak one user's "already handled this
// tap" state into a different account (2026-07 account-switch-leak audit follow-up).
describe('getLastHandledNotificationResponseId / setLastHandledNotificationResponseId (per-user scoping)', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('returns null for a brand new user with no prior data', async () => {
    expect(await getLastHandledNotificationResponseId('user-b')).toBeNull();
  });

  it('returns null for an undefined user id without touching storage', async () => {
    expect(await getLastHandledNotificationResponseId(undefined)).toBeNull();
    await setLastHandledNotificationResponseId(undefined, 'resp-1');
    expect(memory.size).toBe(0);
  });

  it('marking a response handled for one user does not leak to a different user id', async () => {
    await setLastHandledNotificationResponseId('user-a', 'resp-1');

    expect(await getLastHandledNotificationResponseId('user-a')).toBe('resp-1');
    // A DIFFERENT user signing in on the same device must NOT inherit user-a's marker.
    expect(await getLastHandledNotificationResponseId('user-b')).toBeNull();
  });

  it('stores the marker under a per-user key, not the legacy device-wide key', async () => {
    await setLastHandledNotificationResponseId('user-a', 'resp-1');
    expect(memory.get(lastHandledNotificationResponseKey('user-a'))).toBe('resp-1');
    expect(memory.has('gv_last_handled_notification_response_v1')).toBe(false);
  });

  it('falls back to (and does not delete) a legacy device-wide marker for a user with no scoped value yet', async () => {
    memory.set('gv_last_handled_notification_response_v1', 'resp-legacy');

    expect(await getLastHandledNotificationResponseId('user-a')).toBe('resp-legacy');
    expect(memory.has('gv_last_handled_notification_response_v1')).toBe(true);
  });

  it('an explicit scoped value always takes priority over the legacy fallback', async () => {
    memory.set('gv_last_handled_notification_response_v1', 'resp-legacy');
    await setLastHandledNotificationResponseId('user-a', 'resp-scoped');

    expect(await getLastHandledNotificationResponseId('user-a')).toBe('resp-scoped');
  });
});
