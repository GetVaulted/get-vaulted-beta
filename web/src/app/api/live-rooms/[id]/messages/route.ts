import { NextResponse } from "next/server";
import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { loadMentionsForSources, loadMentionsForSource } from "@/lib/mentions/load-message-mentions";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";
import {
  getLastChatAt,
  getLiveRoomSlowModeSeconds,
  getLiveRoomUserRestrictions,
} from "@/lib/trust/live-room-moderation";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const exists = await prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.liveRoomMessage.findMany({
    where: { liveRoomId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { sender: { select: { username: true, image: true } } },
  });

  const mentionMap = await loadMentionsForSources(
    "live_room_message",
    rows.map((r) => r.id),
  );

  return NextResponse.json({
    messages: rows.map((r) => serializeLiveRoomMessage(r, mentionMap.get(r.id))),
  });
}

type PostBody = {
  body?: string;
  messageType?: string;
  clientMessageId?: string;
};

const CHAT_DUPLICATE_WINDOW_MS = 5000;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
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
    return NextResponse.json({ error: "Chat opens when the room is live." }, { status: 409 });
  }

  const restrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  if (restrictions.roomBanned || restrictions.kickedUntil || restrictions.sellerStreamBanned) {
    return NextResponse.json({ error: "You cannot participate in this room." }, { status: 403 });
  }
  if (restrictions.muted) {
    return NextResponse.json({ error: "You are muted in this room." }, { status: 403 });
  }

  const slowMode = await getLiveRoomSlowModeSeconds(liveRoomId);
  if (slowMode > 0) {
    const lastChat = await getLastChatAt(liveRoomId, auth.userId);
    if (lastChat && Date.now() - lastChat.getTime() < slowMode * 1000) {
      return NextResponse.json({ error: `Slow mode — wait ${slowMode}s between messages.` }, { status: 429 });
    }
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "Message body required." }, { status: 400 });

  /** Only chat may be created via this endpoint; bid/purchase/system are server-side. */
  const messageType: LiveRoomMessageType = "chat";

  const duplicate = await prisma.liveRoomMessage.findFirst({
    where: {
      liveRoomId,
      senderId: auth.userId,
      body: text,
      messageType,
      createdAt: { gte: new Date(Date.now() - CHAT_DUPLICATE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { username: true, image: true } } },
  });
  if (duplicate) {
    const mentions = await loadMentionsForSource("live_room_message", duplicate.id);
    return NextResponse.json({ message: serializeLiveRoomMessage(duplicate, mentions) });
  }

  const sender = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true },
  });

  const { row, mentions } = await prisma.$transaction(async (tx) => {
    const created = await tx.liveRoomMessage.create({
      data: {
        liveRoomId,
        senderId: auth.userId,
        body: text,
        messageType,
      },
      include: { sender: { select: { username: true, image: true } } },
    });

    const savedMentions = await processMessageMentions({
      db: tx,
      sourceType: "live_room_message",
      sourceId: created.id,
      body: text,
      senderId: auth.userId,
      senderUsername: sender?.username ?? created.sender?.username ?? "user",
      liveRoomId,
      notifyHref: `/live/${encodeURIComponent(liveRoomId)}`,
      notifyContext: "Live show chat",
    });

    return { row: created, mentions: savedMentions };
  });

  void emitLiveRoomMessageById(row.id);

  return NextResponse.json({ message: serializeLiveRoomMessage(row, mentions) });
}
