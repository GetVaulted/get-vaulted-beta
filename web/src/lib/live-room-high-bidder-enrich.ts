import { prisma } from "@/lib/prisma";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

/** Attach `lastHighBidderUsername` from DB for any items with `lastHighBidderId`. */
export async function attachHighBidderUsernames(items: LiveRoomItemDTO[]): Promise<LiveRoomItemDTO[]> {
  const ids = [
    ...new Set(
      items.map((i) => i.lastHighBidderId).filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ];
  if (ids.length === 0) return items;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  const map = new Map(users.map((u) => [u.id, u.username]));
  return items.map((it) => ({
    ...it,
    lastHighBidderUsername: it.lastHighBidderId ? map.get(it.lastHighBidderId) ?? null : null,
  }));
}
