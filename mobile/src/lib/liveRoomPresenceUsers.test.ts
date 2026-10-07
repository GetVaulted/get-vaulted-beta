import { describe, expect, it } from 'vitest';
import { parseRoomPresenceUsers, sameRoomPresenceRoster } from './liveRoomPresenceUsers';
import { PRESENCE_STALE_MS } from './liveRoomPresenceCount';

describe('parseRoomPresenceUsers', () => {
  it('returns one row per account, deduping devices', () => {
    expect(
      parseRoomPresenceUsers({
        'slot-a': [{ userId: 'user-1', username: '@viewer', tabKey: 'room-1:device-a' }],
        'slot-b': [{ userId: 'user-1', username: '@viewer', tabKey: 'room-1:device-b' }],
      }),
    ).toEqual([{ userId: 'user-1', username: 'viewer', tabKey: 'room-1:device-a' }]);
  });

  it('drops a ghost from the roster once past the staleness window', () => {
    const now = Date.parse('2026-09-17T02:00:00.000Z');
    expect(
      parseRoomPresenceUsers(
        {
          guest: [{ username: '@viewer', tabKey: 'g1', at: new Date(now - 5_000).toISOString() }],
          ghost: [
            { username: '@gone', tabKey: 'g2', at: new Date(now - PRESENCE_STALE_MS - 1_000).toISOString() },
          ],
        },
        now,
      ),
    ).toEqual([{ userId: null, username: 'viewer', tabKey: 'g1' }]);
  });
});

describe('sameRoomPresenceRoster', () => {
  const a = { userId: 'u1', username: 'amy', tabKey: undefined };
  const b = { userId: 'u2', username: 'bo', tabKey: undefined };

  it('treats identical rosters as the same, even as new arrays', () => {
    expect(sameRoomPresenceRoster([a, b], [{ ...a }, { ...b }])).toBe(true);
    expect(sameRoomPresenceRoster([], [])).toBe(true);
  });

  it('detects joins, leaves and renames', () => {
    expect(sameRoomPresenceRoster([a], [a, b])).toBe(false);
    expect(sameRoomPresenceRoster([a, b], [a])).toBe(false);
    expect(sameRoomPresenceRoster([a], [{ ...a, username: 'amy2' }])).toBe(false);
  });
});
