export type RoomPresenceUser = {
  userId: string | null;
  username: string;
  tabKey?: string;
};

function normalizePresenceUsername(username: unknown, userId: string | null): string {
  if (typeof username === 'string' && username.trim()) {
    return username.trim().replace(/^@/, '');
  }
  if (userId) return 'Member';
  return 'Guest';
}

/**
 * Parse Supabase Realtime presence into one row PER PERSON (deduped by account) for roster / moderator
 * displays. This is intentionally different from the live viewer *count*, which is per-connection —
 * see `countRoomPresenceViewers`. A roster wants each human once; the counter wants raw headcount.
 */
export function parseRoomPresenceUsers(state: Record<string, unknown> | null | undefined): RoomPresenceUser[] {
  if (!state || typeof state !== 'object') return [];

  const byKey = new Map<string, RoomPresenceUser>();

  for (const entries of Object.values(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const userId = typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : null;
      const tabKey = typeof p.tabKey === 'string' && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      const username = normalizePresenceUsername(p.username, userId);
      const key = userId ?? tabKey ?? `guest:${username.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { userId, username, tabKey });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
}
