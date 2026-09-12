import { NextResponse } from "next/server";
import { isRoomOpenForHostTeamBoardEdit } from "@/lib/live-room-commerce-guards";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";

/**
 * Host team board: bring an unavailable (removed) team back so it can sell again —
 * e.g. a late supplemental / "supp" run for that team with buyer username.
 * Does not create a sale by itself; host can then Mark sold / Supp sold.
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
        select: { id: true, status: true },
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
          variantBreakReadyAt: true,
          variantBreakBeganAt: true,
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
        select: {
          id: true,
          label: true,
          status: true,
          quantityInitial: true,
          quantityRemaining: true,
        },
      });
      if (!variant) throw Object.assign(new Error("VARIANT_NOT_FOUND"), { code: "VARIANT_NOT_FOUND" });

      if (variant.status !== "removed") {
        if (variant.status === "sold_out" || variant.quantityRemaining <= 0) {
          throw Object.assign(new Error("ALREADY_SOLD"), { code: "ALREADY_SOLD" });
        }
        return {
          label: variant.label,
          alreadyOpen: true,
          quantityRemaining: variant.quantityRemaining,
        };
      }

      const qty = Math.max(1, variant.quantityInitial || 1);
      await tx.liveItemVariant.update({
        where: { id: variantId },
        data: {
          status: "available",
          quantityRemaining: qty,
          isHot: false,
        },
      });

      // Re-opening a spot means the break is no longer "all sold" — clear ready unless rip already started.
      const clearBreakReady =
        item.variantBreakReadyAt != null && item.variantBreakBeganAt == null
          ? { variantBreakReadyAt: null as Date | null }
          : {};

      await tx.liveRoomItem.update({
        where: { id: itemId },
        data: { ...clearBreakReady, itemVersion: { increment: 1 } },
      });

      await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
      });

      return { label: variant.label, alreadyOpen: false, quantityRemaining: qty };
    });

    emitLiveRoomQueueItemsChanged(liveRoomId);

    return NextResponse.json({
      ok: true,
      label: result.label,
      alreadyOpen: result.alreadyOpen,
      quantityRemaining: result.quantityRemaining,
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
        { error: "Room must be live, scheduled, or ended to restore teams." },
        { status: 409 },
      );
    }
    if (code === "ITEM_NOT_FOUND" || code === "VARIANT_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (code === "ITEM_UNAVAILABLE" || code === "NOT_TEAM_BOARD") {
      return NextResponse.json({ error: "This lot cannot be edited from the team board." }, { status: 409 });
    }
    console.error("[variants/restore]", e);
    return NextResponse.json({ error: "Could not bring team back." }, { status: 500 });
  }
}
