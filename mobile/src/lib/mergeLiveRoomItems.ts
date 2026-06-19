type QueueItemLike = {
  id: string;
  sortOrder?: number;
  itemVersion?: number;
};

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
    map.set(item.id, nextVer >= prevVer ? item : existing);
  }

  return [...map.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
