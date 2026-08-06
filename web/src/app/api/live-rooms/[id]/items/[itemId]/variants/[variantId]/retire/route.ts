import { NextResponse } from "next/server";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import { isRoomOpenForHostTeamBoardEdit } from "@/lib/live-room-commerce-guards";
import { idleVariantSpotCommerceReset } from "@/lib/live-variant-spot-commerce";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";

/**
 * Host team board: mark a PYT/PYD team unavailable without recording a sale.
 * Keeps the team on the board as not available. Does not create a purchase,
 * bump soldCount, or inflate Show sales.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string; variantId: string }> },
) {
  const { id: rawRoom, itemId, variantId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: { id: true, sellerId: true, status: true },
      });
      if (!room || !isRoomOpenForHostTeamBoardEdit(room.status)) {
        throw Object.assign(new Error("ROOM_NOT_EDITABLE"), { code: "ROOM_NOT_EDITABLE" });
      }

      const item = await tx.liveRoomItem.findFirst({
        where: { id: itemId, liveRoomId },
        select: {
          id: true,
          status: true,
          salesFormat: true,
          biddingOpen: true,
          auctionVariantId: true,
        },
      });
      if (!item) throw Object.assign(new Error("ITEM_NOT_FOUND"), { code: "ITEM_NOT_FOUND" });
      if (item.status !== "active" && item.status !== "queued") {
        throw Object.assign(new Error("ITEM_UNAVAILABLE"), { code: "ITEM_UNAVAILABLE" });
      }
      if (item.salesFormat !== "variant_selection" && item.salesFormat !== "team_break" && item.salesFormat !== "player_selection") {
        throw Object.assign(new Error("NOT_TEAM_BOARD"), { code: "NOT_TEAM_BOARD" });
      }

      const variant = await tx.liveItemVariant.findFirst({
        where: { id: variantId, liveRoomItemId: itemId },
        select: { id: true, label: true, status: true, quantityRemaining: true },
      });
      if (!variant) throw Object.assign(new Error("VARIANT_NOT_FOUND"), { code: "VARIANT_NOT_FOUND" });
      if (variant.status === "removed") {
        return { label: variant.label, alreadyRemoved: true, sellerId: room.sellerId };
      }
      if (variant.status === "sold_out" || variant.quantityRemaining <= 0) {
        throw Object.assign(new Error("ALREADY_SOLD"), { code: "ALREADY_SOLD" });
      }

      await tx.liveItemVariant.update({
        where: { id: variantId },
        data: {
          status: "removed",
          quantityRemaining: 0,
          isHot: false,
          // Do NOT increment soldCount — this is not a sale.
        },
      });

      if (item.biddingOpen && item.auctionVariantId === variantId) {
        await tx.liveRoomItem.update({
          where: { id: itemId },
          data: { ...idleVariantSpotCommerceReset(), itemVersion: { increment: 1 } },
        });
      } else {
        await tx.liveRoomItem.update({
          where: { id: itemId },
          data: { itemVersion: { increment: 1 } },
        });
      }

      await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
      });

      return { label: variant.label, alreadyRemoved: false, sellerId: room.sellerId };
    });

    await maybeMarkVariantBreakReady(itemId, liveRoomId, result.sellerId);
    emitLiveRoomQueueItemsChanged(liveRoomId);

    return NextResponse.json({
      ok: true,
      label: result.label,
      alreadyRemoved: result.alreadyRemoved,
    });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "ALREADY_SOLD") {
      return NextResponse.json(
        { error: "That team is already sold. Use Mark sold only for real sales." },
        { status: 409 },
      );
    }
    if (code === "ROOM_NOT_EDITABLE") {
      return NextResponse.json(
        { error: "Room must be live, scheduled, or ended to remove teams." },
        { status: 409 },
      );
    }
    if (code === "ITEM_NOT_FOUND" || code === "VARIANT_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (code === "ITEM_UNAVAILABLE" || code === "NOT_TEAM_BOARD") {
      return NextResponse.json({ error: "This lot cannot be edited from the team board." }, { status: 409 });
    }
    console.error("[variants/retire]", e);
    return NextResponse.json({ error: "Could not remove team from board." }, { status: 500 });
  }
}
