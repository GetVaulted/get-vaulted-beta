type QueueItemLike = {
  id: string;
  sortOrder?: number;
  itemVersion?: number;
  randomSpotClaims?: { label: string; buyerUsername: string }[];
};

function mergeRandomSpotClaims(
  prev?: { label: string; buyerUsername: string }[],
  next?: { label: string; buyerUsername: string }[],
): { label: string; buyerUsername: string }[] | undefined {
  if (!prev?.length && !next?.length) return undefined;
  const map = new Map<string, { label: string; buyerUsername: string }>();
  for (const c of prev ?? []) {
    map.set(c.label.trim().toLowerCase(), c);
  }
  for (const c of next ?? []) {
    map.set(c.label.trim().toLowerCase(), c);
  }
  return [...map.values()];
}

/** Flat queue merge for mobile host console items. */
export function mergeLiveRoomItemsById<TItem extends QueueItemLike>(
  prev: TItem[],
  incoming: TItem[],
): TItem[] {
  if (!incoming.length && prev.length) return prev;

  const map = new Map<string, TItem>();
  for (const item of prev) map.set(item.id, item);
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    const prevVer = existing.itemVersion ?? 0;
    const nextVer = item.itemVersion ?? 0;
    const winner = nextVer >= prevVer ? item : existing;
    const loser = winner === item ? existing : item;
    const randomSpotClaims = mergeRandomSpotClaims(loser.randomSpotClaims, winner.randomSpotClaims);
    map.set(item.id, randomSpotClaims ? { ...winner, randomSpotClaims } : winner);
  }

  return [...map.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Host active lot — replace entirely when the pinned item changes; merge only same lot. */
export function reconcileHostActiveItem<TItem extends QueueItemLike>(
  prev: TItem | null,
  next: TItem | null,
): TItem | null {
  if (!next) return null;
  if (!prev || prev.id !== next.id) return next;
  return mergeLiveRoomItemsById([prev], [next])[0] ?? next;
}
