import { describe, expect, it } from 'vitest';
import { mergeModeratorRoomUsers } from './mergeModeratorRoomUsers';
import { parseRoomPresenceUsers } from './liveRoomPresenceUsers';

describe('parseRoomPresenceUsers', () => {
  it('returns empty list for null or invalid state', () => {
    expect(parseRoomPresenceUsers(null)).toEqual([]);
    expect(parseRoomPresenceUsers(undefined)).toEqual([]);
  });

  it('dedupes presence slots by user id', () => {
    const rows = parseRoomPresenceUsers({
      'slot-a': [{ userId: 'u1', username: '@alpha', tabKey: 't1' }],
      'slot-b': [{ userId: 'u2', username: 'beta', tabKey: 't2' }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.username)).toEqual(['alpha', 'beta']);
  });
});

describe('mergeModeratorRoomUsers', () => {
  it('merges live presence with recent chatters', () => {
    const rows = mergeModeratorRoomUsers({
      presence: [{ userId: 'u1', username: 'alpha' }],
      viewers: [
        {
          userId: 'u2',
          username: 'bravo',
          lastSeenAt: '2026-01-01T12:00:00.000Z',
          messageCount: 3,
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === 'u1')?.inRoom).toBe(true);
    expect(rows.find((r) => r.userId === 'u2')?.inRoom).toBe(false);
    expect(rows.find((r) => r.userId === 'u2')?.messageCount).toBe(3);
  });

  it('falls back when viewer username is missing', () => {
    const rows = mergeModeratorRoomUsers({
      presence: [],
      viewers: [
        {
          userId: 'u3',
          username: '',
          lastSeenAt: '2026-01-01T12:00:00.000Z',
          messageCount: 1,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.username).toBe('Member');
  });
});
