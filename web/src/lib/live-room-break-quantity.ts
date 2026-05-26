import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

/**
 * Queue rows can represent multiple units (`LiveRoomItem.quantity`). Mark the row sold only when
 * every unit has a corresponding `BreakSpot` tied to `liveRoomItemId`.
 */
export async function refreshLiveRoomItemSoldAfterBreakSpotChange(
  tx: TransactionClient,
  liveRoomItemId: string,
): Promise<void> {
  const item = await tx.liveRoomItem.findUnique({
    where: { id: liveRoomItemId },
    select: { id: true, liveRoomId: true, quantity: true, quantityInitial: true, status: true },
  });
  if (!item || item.status === "skipped") return;

  const qty = Math.max(1, item.quantityInitial ?? item.quantity);
  const count = await tx.breakSpot.count({ where: { liveRoomItemId } });

  if (count >= qty) {
    if (item.status !== "sold") {
      await tx.liveRoomItem.update({
        where: { id: liveRoomItemId },
        data: { status: "sold", itemVersion: { increment: 1 } },
      });
      await tx.liveRoom.update({
        where: { id: item.liveRoomId },
        data: { roomVersion: { increment: 1 } },
      });
    }
    return;
  }

  if (item.status === "sold") {
    await tx.liveRoomItem.update({
      where: { id: liveRoomItemId },
      data: { status: "active", itemVersion: { increment: 1 } },
    });
    await tx.liveRoom.update({
      where: { id: item.liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
  }
}
