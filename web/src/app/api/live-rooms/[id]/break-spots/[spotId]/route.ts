import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { refreshLiveRoomItemSoldAfterBreakSpotChange } from "@/lib/live-room-break-quantity";
import { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } from "@/lib/realtime-emit-server";

type PatchBody = {
  action?: string;
  buyerUserId?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; spotId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw, spotId: spotRaw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const spotId = decodeURIComponent(spotRaw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const spot = await prisma.breakSpot.findFirst({
    where: { id: spotId, liveRoomId },
    include: { user: { select: { username: true } } },
  });
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { sellerId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "release") {
    await prisma.$transaction(async (tx) => {
      const linkedItemId = spot.liveRoomItemId;
      await tx.breakSpot.delete({ where: { id: spot.id } });
      if (linkedItemId) {
        await refreshLiveRoomItemSoldAfterBreakSpotChange(tx, linkedItemId);
        const remaining = await tx.breakSpot.count({ where: { liveRoomItemId: linkedItemId } });
        if (remaining === 0) {
          await tx.liveRoomItem.updateMany({
            where: { id: linkedItemId, liveRoomId },
            data: { status: "queued", biddingOpen: false, auctionEndsAt: null },
          });
        }
      }
      await tx.liveRoomMessage.create({
        data: {
          liveRoomId,
          senderId: room.sellerId,
          body: `Host released spot “${spot.spotLabel}” (@${spot.user.username}).`,
          messageType: "system",
        },
      });
    });
    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_paid") {
    await prisma.breakSpot.update({
      where: { id: spot.id },
      data: { claimStatus: "paid", paidAt: new Date() },
    });
    await prisma.liveRoomMessage.create({
      data: {
        liveRoomId,
        senderId: room.sellerId,
        body: `Payment confirmed for “${spot.spotLabel}” (@${spot.user.username}).`,
        messageType: "system",
      },
    });
    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  }

  if (action === "lock") {
    await prisma.breakSpot.update({
      where: { id: spot.id },
      data: { claimStatus: "locked", lockedAt: new Date() },
    });
    await prisma.liveRoomMessage.create({
      data: {
        liveRoomId,
        senderId: room.sellerId,
        body: `Spot locked: “${spot.spotLabel}” (@${spot.user.username}).`,
        messageType: "system",
      },
    });
    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  }

  if (action === "assign_buyer") {
    const buyerUserId = typeof body.buyerUserId === "string" ? body.buyerUserId.trim() : "";
    if (!buyerUserId) return NextResponse.json({ error: "buyerUserId required." }, { status: 400 });
    const buyer = await prisma.user.findUnique({
      where: { id: buyerUserId },
      select: { id: true, username: true, suspendedAt: true },
    });
    if (!buyer || buyer.suspendedAt) {
      return NextResponse.json({ error: "Buyer not found or suspended." }, { status: 400 });
    }
    try {
      await prisma.breakSpot.update({
        where: { id: spot.id },
        data: { userId: buyer.id },
      });
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "Could not reassign buyer." }, { status: 500 });
    }
    await prisma.liveRoomMessage.create({
      data: {
        liveRoomId,
        senderId: room.sellerId,
        body: `Host reassigned “${spot.spotLabel}” to @${buyer.username}.`,
        messageType: "system",
      },
    });
    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action. Use release, mark_paid, lock, or assign_buyer." }, { status: 400 });
}
