import { prisma } from "@/lib/prisma";
import {
  emitLiveRoomMessageById,
  emitLiveRoomQueueItemsChanged,
  emitTeamBreakBegan,
  emitTeamBreakReady,
} from "@/lib/realtime-emit-server";
import { allVariantSpotsSold } from "@/lib/live-item-variant-presets";

/** After a variant purchase settles, mark break ready when every spot is sold. */
export async function maybeMarkVariantBreakReady(liveRoomItemId: string, liveRoomId: string, sellerId: string) {
  const variants = await prisma.liveItemVariant.findMany({
    where: { liveRoomItemId },
    select: { quantityRemaining: true, status: true },
  });
  if (!allVariantSpotsSold(variants)) return false;

  const updated = await prisma.liveRoomItem.updateMany({
    where: { id: liveRoomItemId, liveRoomId, variantBreakReadyAt: null },
    data: { variantBreakReadyAt: new Date(), itemVersion: { increment: 1 } },
  });
  if (updated.count === 0) return false;

  const item = await prisma.liveRoomItem.findUnique({
    where: { id: liveRoomItemId },
    select: { itemVersion: true, salesFormat: true },
  });
  const itemVersion = item?.itemVersion ?? 0;
  const isDivisionBreak = item?.salesFormat === "team_break";
  const spotWord = isDivisionBreak ? "divisions" : "teams";

  const sellerMsg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: sellerId,
      body: `All ${spotWord} sold. Break is ready to begin.`,
      messageType: "system",
    },
  });
  const buyerMsg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: sellerId,
      body: "Break is full — the host will start the break soon.",
      messageType: "system",
    },
  });

  emitTeamBreakReady(liveRoomId, { itemId: liveRoomItemId, itemVersion });
  emitLiveRoomQueueItemsChanged(liveRoomId);
  await emitLiveRoomMessageById(sellerMsg.id);
  await emitLiveRoomMessageById(buyerMsg.id);
  return true;
}

/** Host action: mark break as begun and notify the room. */
export async function beginVariantTeamBreak(liveRoomId: string, liveRoomItemId: string, sellerId: string) {
  const item = await prisma.liveRoomItem.findFirst({
    where: { id: liveRoomItemId, liveRoomId },
    select: {
      id: true,
      status: true,
      salesFormat: true,
      variantBreakReadyAt: true,
      variantBreakBeganAt: true,
      itemVersion: true,
    },
  });
  if (!item) return { ok: false as const, error: "Item not found." };
  if (item.status !== "active") return { ok: false as const, error: "Pin this break item first." };
  if (item.salesFormat !== "team_break" && item.salesFormat !== "variant_selection" && item.salesFormat !== "player_selection") {
    return { ok: false as const, error: "This lot is not a spot-sale break." };
  }
  if (!item.variantBreakReadyAt) {
    return { ok: false as const, error: "All spots must sell before you can begin the break." };
  }
  if (item.variantBreakBeganAt) {
    return { ok: false as const, error: "Break has already begun." };
  }

  const next = await prisma.liveRoomItem.update({
    where: { id: liveRoomItemId },
    data: { variantBreakBeganAt: new Date(), itemVersion: { increment: 1 } },
    select: { itemVersion: true },
  });

  const msg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: sellerId,
      body: "Break has begun.",
      messageType: "system",
    },
  });

  emitTeamBreakBegan(liveRoomId, { itemId: liveRoomItemId, itemVersion: next.itemVersion });
  emitLiveRoomQueueItemsChanged(liveRoomId);
  await emitLiveRoomMessageById(msg.id);

  return { ok: true as const, itemVersion: next.itemVersion };
}
