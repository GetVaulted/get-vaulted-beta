import { describe, expect, it } from 'vitest';
import { parseRoomPresenceUsers } from './liveRoomPresenceUsers';
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
