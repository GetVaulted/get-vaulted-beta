import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";

/**
 * Deletes every **queued** `LiveRoomItem` in the room (skipped/active/sold are kept).
 * Use after mistaken bulk LOT imports; confirm in the UI before calling.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Set confirm: true to delete all queued items." }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { sellerId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = actor?.role === "admin";
  if (room.sellerId !== session.user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended. You cannot change the queue." }, { status: 409 });
  }

  let deleted = 0;
  try {
    deleted = await prisma.$transaction(async (tx) => {
      const queued = await tx.liveRoomItem.findMany({
        where: { liveRoomId, status: "queued" },
        select: { id: true },
      });
      const ids = queued.map((r) => r.id);
      if (ids.length === 0) return 0;
      await tx.breakSpot.updateMany({
        where: { liveRoomItemId: { in: ids } },
        data: { liveRoomItemId: null },
      });
      const res = await tx.liveRoomItem.deleteMany({
        where: { liveRoomId, id: { in: ids }, status: "queued" },
      });
      await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
      });
      return res.count;
    });
  } catch (e) {
    console.error("[live-room bulk-delete-queued]", e);
    return NextResponse.json({ error: "Could not delete queued items." }, { status: 500 });
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({ ok: true, deleted });
}
