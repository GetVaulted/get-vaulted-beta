import { describe, expect, it } from 'vitest';
import { countRoomPresenceViewers, PRESENCE_STALE_MS } from './liveRoomPresenceCount';

describe('countRoomPresenceViewers (per-connection headcount)', () => {
  it('returns 0 for an empty room', () => {
    expect(countRoomPresenceViewers({})).toBe(0);
    expect(countRoomPresenceViewers(null)).toBe(0);
    expect(countRoomPresenceViewers(undefined)).toBe(0);
  });

  it('counts each device/session as +1', () => {
    expect(
      countRoomPresenceViewers({
        'slot-a': [{ userId: 'user-1', tabKey: 'room-1:device-a' }],
        'slot-b': [{ userId: 'user-2', tabKey: 'room-1:device-b' }],
      }),
    ).toBe(2);
  });

  it('counts the same account on two devices as two viewers', () => {
    expect(
      countRoomPresenceViewers({
        'slot-a': [{ userId: 'user-1', tabKey: 'room-1:device-a' }],
        'slot-b': [{ userId: 'user-1', tabKey: 'room-1:device-b' }],
      }),
    ).toBe(2);
  });

  it('collapses duplicate metas sharing a single connection slot', () => {
    expect(
      countRoomPresenceViewers({
        'slot-a': [
          { userId: 'user-1', tabKey: 'room-1:device-a' },
          { userId: 'user-1', tabKey: 'room-1:device-a' },
        ],
      }),
    ).toBe(1);
  });

  it('counts multiple anonymous guests separately', () => {
    expect(
      countRoomPresenceViewers({
        g1: [{ tabKey: 'room-1:guest-1' }],
        g2: [{ tabKey: 'room-1:guest-2' }],
      }),
    ).toBe(2);
  });

  it('ignores empty / stale presence slots', () => {
    expect(
      countRoomPresenceViewers({
        'slot-a': [{ userId: 'user-1', tabKey: 'room-1:device-a' }],
        stale: [],
      }),
    ).toBe(1);
  });

  it('drops a ghost entry whose last heartbeat is past the staleness window', () => {
    const now = Date.parse('2026-09-17T02:00:00.000Z');
    expect(
      countRoomPresenceViewers(
        {
          fresh: [{ tabKey: 'room-1:live', at: new Date(now - 5_000).toISOString() }],
          ghost: [{ tabKey: 'room-1:ghost', at: new Date(now - PRESENCE_STALE_MS - 1_000).toISOString() }],
        },
        now,
      ),
    ).toBe(1);
  });

  it('does not penalize an entry with no `at` timestamp at all', () => {
    expect(
      countRoomPresenceViewers({
        'slot-a': [{ tabKey: 'room-1:no-timestamp' }],
      }),
    ).toBe(1);
  });
});
