type QueueItemLike = {
  id: string;
  sortOrder?: number;
  itemVersion?: number;
};

type QueueRowLike<TItem extends QueueItemLike> = {
  item: TItem;
};

function pickNewerRow<TItem extends QueueItemLike, TRow extends QueueRowLike<TItem>>(
  prev: TRow,
  incoming: TRow,
): TRow {
  const prevVer = prev.item.itemVersion ?? 0;
  const nextVer = incoming.item.itemVersion ?? 0;
  return nextVer >= prevVer ? incoming : prev;
}

/** Merge host-console queue rows by item id; keep local rows when a stale fetch returns empty. */
export function mergeHostQueueRows<TItem extends QueueItemLike, TRow extends QueueRowLike<TItem>>(
  prev: TRow[],
  incoming: TRow[],
): TRow[] {
  if (!incoming.length && prev.length) return prev;

  const map = new Map<string, TRow>();
  for (const row of prev) map.set(row.item.id, row);
  for (const row of incoming) {
    const existing = map.get(row.item.id);
    map.set(row.item.id, existing ? pickNewerRow(existing, row) : row);
  }

  return [...map.values()].sort((a, b) => (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0));
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
    map.set(item.id, nextVer >= prevVer ? item : existing);
  }

  return [...map.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
