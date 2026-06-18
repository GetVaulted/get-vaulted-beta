import { NextResponse } from "next/server";
import { cancelLiveRoomPaymentFailureBySeller } from "@/lib/live-room-payment-failure";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { prisma } from "@/lib/prisma";

type Body = {
  failureId?: unknown;
};

/** Host cancels a buyer payment retry — spot returns to the board and commerce unblocks for that buyer. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }

  const failureId = typeof body.failureId === "string" ? body.failureId.trim() : "";
  if (!failureId) {
    return NextResponse.json({ error: "failureId is required." }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { sellerId: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const actor = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  const isHost = room.sellerId === auth.userId || actor?.role === "admin";
  if (!isHost) {
    return NextResponse.json({ error: "Only the host can cancel payment retries." }, { status: 403 });
  }

  const result = await cancelLiveRoomPaymentFailureBySeller({
    liveRoomId,
    sellerId: room.sellerId,
    failureId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.code === "NOT_FOUND" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}
