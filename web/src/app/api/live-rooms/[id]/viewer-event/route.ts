import { NextResponse } from "next/server";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

export const VIEWER_EVENT_JOIN_BODY = "joined 🔥";
export const VIEWER_EVENT_JOIN_BODY_LEGACY = "joined 👋";
export const VIEWER_EVENT_SHARE_BODY = "shared this show ✉️";

const JOIN_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const SHARE_DEDUPE_WINDOW_MS = 30 * 1000;

import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";

type PostBody = { kind?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Sign in to join the show." }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "Room is not live yet." }, { status: 409 });
  }

  const restrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  if (restrictions.roomBanned || restrictions.kickedUntil || restrictions.sellerStreamBanned) {
    return NextResponse.json({ error: "You cannot join this room." }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  if (kind !== "join" && kind !== "share") {
    return NextResponse.json({ error: "kind must be join or share." }, { status: 400 });
  }

  const text = kind === "join" ? VIEWER_EVENT_JOIN_BODY : VIEWER_EVENT_SHARE_BODY;
  const dedupeWindowMs = kind === "join" ? JOIN_DEDUPE_WINDOW_MS : SHARE_DEDUPE_WINDOW_MS;

  const duplicate = await prisma.liveRoomMessage.findFirst({
    where: {
      liveRoomId,
      senderId: auth.userId,
      body: text,
      messageType: "system",
      createdAt: { gte: new Date(Date.now() - dedupeWindowMs) },
    },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { username: true, image: true } } },
  });
  if (duplicate) {
    return NextResponse.json({ message: serializeLiveRoomMessage(duplicate) });
  }

  const row = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: auth.userId,
      body: text,
      messageType: "system",
    },
    include: { sender: { select: { username: true, image: true } } },
  });

  void emitLiveRoomMessageById(row.id);

  return NextResponse.json({ message: serializeLiveRoomMessage(row) });
}
