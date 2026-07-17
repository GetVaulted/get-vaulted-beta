export type RoomPresenceUser = {
  userId: string | null;
  username: string;
  tabKey?: string;
};

function normalizePresenceUsername(username: unknown, userId: string | null): string {
  if (typeof username === "string" && username.trim()) {
    return username.trim().replace(/^@/, "");
  }
  if (userId) return "Member";
  return "Guest";
}

/**
 * Live viewer count = per-connection headcount (one per device/session): +1 when someone enters,
 * -1 when they leave. Each distinct presence slot counts, so the same account on two devices shows
 * as two. This is deliberately NOT the same as the roster (`parseRoomPresenceUsers`), which dedupes
 * by account. The host console tracks nothing (observe-only), so the host is never counted.
 */
export function countRoomPresenceViewers(state: Record<string, unknown> | null | undefined): number {
  if (!state || typeof state !== "object") return 0;

  const connections = new Set<string>();
  for (const [stateKey, entries] of Object.entries(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const tabKey = typeof p.tabKey === "string" && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      connections.add(tabKey ?? stateKey);
    }
  }
  return connections.size;
}

/**
 * Parse Supabase Realtime presence into one row PER PERSON (deduped by account) for roster / moderator
 * displays. Different from the viewer *count* above, which is per-connection.
 */
export function parseRoomPresenceUsers(state: Record<string, unknown>): RoomPresenceUser[] {
  const byKey = new Map<string, RoomPresenceUser>();

  for (const entries of Object.values(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const userId = typeof p.userId === "string" && p.userId.trim() ? p.userId.trim() : null;
      const tabKey = typeof p.tabKey === "string" && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      const username = normalizePresenceUsername(p.username, userId);
      const key = userId ?? tabKey ?? `guest:${username.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { userId, username, tabKey });
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: "base" }),
  );
}
