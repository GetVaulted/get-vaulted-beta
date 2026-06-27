import type { LiveRoomViewerRow } from '../api/trustRepository';
import type { RoomPresenceUser } from './liveRoomPresenceUsers';

export type ModeratorRoomUserRow = {
  key: string;
  userId: string | null;
  username: string;
  inRoom: boolean;
  messageCount?: number;
  lastSeenAt?: string;
  isGuest: boolean;
};

export function mergeModeratorRoomUsers(args: {
  presence: RoomPresenceUser[];
  viewers: LiveRoomViewerRow[];
}): ModeratorRoomUserRow[] {
  const map = new Map<string, ModeratorRoomUserRow>();

  for (const viewer of args.viewers) {
    map.set(viewer.userId, {
      key: viewer.userId,
      userId: viewer.userId,
      username: viewer.username,
      inRoom: false,
      messageCount: viewer.messageCount,
      lastSeenAt: viewer.lastSeenAt,
      isGuest: false,
    });
  }

  for (const p of args.presence) {
    if (p.userId) {
      const existing = map.get(p.userId);
      map.set(p.userId, {
        key: p.userId,
        userId: p.userId,
        username: p.username || existing?.username || 'Member',
        inRoom: true,
        messageCount: existing?.messageCount,
        lastSeenAt: existing?.lastSeenAt,
        isGuest: false,
      });
      continue;
    }

    const guestKey = `guest:${p.tabKey ?? p.username.toLowerCase()}`;
    if (map.has(guestKey)) continue;
    map.set(guestKey, {
      key: guestKey,
      userId: null,
      username: p.username,
      inRoom: true,
      isGuest: true,
    });
  }

  return [...map.values()].sort((a, b) => {
    if (a.inRoom !== b.inRoom) return a.inRoom ? -1 : 1;
    const aName = a.username.toLowerCase();
    const bName = b.username.toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);
    return a.key.localeCompare(b.key);
  });
}
