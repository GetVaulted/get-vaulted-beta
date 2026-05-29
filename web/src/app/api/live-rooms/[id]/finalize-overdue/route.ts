import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { finalizeOverdueLiveAuctionLotsForRoom } from "@/lib/live-auction-finalize";

/**
 * Server-authoritative timer-zero nudge. Any room participant (seller or buyer) may call this when
 * their synced countdown crosses zero; the server ignores the client's clock and re-derives
 * overdue purely from `auctionEndsAt` vs server time, then finalizes (settle + charge winner, or
 * close unsold). Idempotent — concurrent nudges and the GET read-sweep cannot double-process.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, roomType: true, roomVersion: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (room.status !== "live" || (room.roomType !== "auction" && room.roomType !== "break")) {
    return NextResponse.json({ ok: true, finalized: 0, results: [] });
  }

  try {
    const summary = await finalizeOverdueLiveAuctionLotsForRoom({
      liveRoomId: room.id,
      room: { sellerId: room.sellerId, roomType: room.roomType, roomVersion: room.roomVersion },
      trigger: "timer_nudge",
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[api/live-rooms/[id]/finalize-overdue]", e);
    return NextResponse.json({ error: "Could not finalize overdue auctions." }, { status: 500 });
  }
}
