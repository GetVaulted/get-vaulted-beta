/** Epoch ms for a scheduled start; unknown/invalid times sort to the very end. */
export function scheduledStartMs(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Upcoming shows ordered by scheduled start — soonest first.
 * Shows with no/invalid start time fall to the bottom. Stable on ties.
 */
export function orderScheduledByStartTime<T extends { scheduledStartAtIso?: string | null }>(
  streams: T[],
): T[] {
  return streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => {
      const delta =
        scheduledStartMs(a.stream.scheduledStartAtIso) - scheduledStartMs(b.stream.scheduledStartAtIso);
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((entry) => entry.stream);
}

type DirectoryRoom = {
  status: "live_now" | "scheduled" | string;
  viewers?: number;
  scheduledStartAtIso?: string | null;
};

/**
 * Match mobile Live discovery browse order:
 * 1) live first (higher viewers first)
 * 2) scheduled soonest-first by scheduledStartAtIso
 */
export function orderLiveDirectoryRooms<T extends DirectoryRoom>(rooms: T[]): T[] {
  const live: { room: T; index: number }[] = [];
  const scheduled: { room: T; index: number }[] = [];
  rooms.forEach((room, index) => {
    if (room.status === "live_now" || room.status === "live") live.push({ room, index });
    else scheduled.push({ room, index });
  });

  live.sort((a, b) => {
    const delta = (b.room.viewers ?? 0) - (a.room.viewers ?? 0);
    return delta !== 0 ? delta : a.index - b.index;
  });

  scheduled.sort((a, b) => {
    const delta =
      scheduledStartMs(a.room.scheduledStartAtIso) - scheduledStartMs(b.room.scheduledStartAtIso);
    return delta !== 0 ? delta : a.index - b.index;
  });

  return [...live.map((e) => e.room), ...scheduled.map((e) => e.room)];
}
