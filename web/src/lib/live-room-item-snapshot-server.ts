import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { prisma } from "@/lib/prisma";
import { serializeLiveRoomItem, type LiveRoomItemDTO } from "@/lib/live-room-serialize";

/** Full row → buyer/host DTO with `lastHighBidderUsername` resolved (for bid/start HTTP acks). */
export async function getLiveRoomItemSnapshotDto(itemId: string): Promise<LiveRoomItemDTO | null> {
  const row = await prisma.liveRoomItem.findUnique({ where: { id: itemId } });
  if (!row) return null;
  const [item] = await attachHighBidderUsernames([serializeLiveRoomItem(row)]);
  return item ?? null;
}
