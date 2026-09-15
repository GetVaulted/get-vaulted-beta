import { NextResponse } from "next/server";
import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { loadMentionsForSources, loadMentionsForSource } from "@/lib/mentions/load-message-mentions";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId, resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";
import { LIVE_ROOM_CHAT_HISTORY_MAX, liveRoomChatOpen } from "@/lib/live-room-chat-policy";
import {
  filterStaffMessagesForViewer,
  viewerCanAccessStaffChat,
} from "@/lib/live-room-staff-chat";
import {
  getLastChatAt,
  getLiveRoomModeratorContext,
  getLiveRoomSlowModeSeconds,
  getLiveRoomUserRestrictions,
} from "@/lib/trust/live-room-moderation";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const exists = await prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewerId = await resolveOptionalLiveRoomsUserId(req);
  const canSeeStaff = await viewerCanAccessStaffChat({ liveRoomId, userId: viewerId });

  const rows = await prisma.liveRoomMessage.findMany({
    where: {
      liveRoomId,
      deletedAt: null,
      ...(canSeeStaff ? {} : { messageType: { not: "staff" } }),
    },
    orderBy: { createdAt: "desc" },
    take: LIVE_ROOM_CHAT_HISTORY_MAX,
    include: { sender: { select: { username: true, image: true } } },
  });
  rows.reverse();

  const mentionMap = await loadMentionsForSources(
    "live_room_message",
    rows.map((r) => r.id),
  );

  const messages = filterStaffMessagesForViewer(
    rows.map((r) => serializeLiveRoomMessage(r, mentionMap.get(r.id))),
    canSeeStaff,
  );

  return NextResponse.json({ messages });
}

type PostBody = {
  body?: string;
  messageType?: string;
  /** When true (host/mod only), message is staff-only. */
  staffOnly?: boolean;
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
  if (!liveRoomChatOpen(room.status)) {
    return NextResponse.json({ error: "Chat is not available for this room." }, { status: 409 });
  }

  const restrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  if (restrictions.roomBanned || restrictions.kickedUntil || restrictions.sellerStreamBanned) {
    return NextResponse.json({ error: "You cannot participate in this room." }, { status: 403 });
  }
  if (restrictions.muted) {
    return NextResponse.json({ error: "You are muted in this room." }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const wantStaff =
    body.staffOnly === true ||
    (typeof body.messageType === "string" && body.messageType.trim().toLowerCase() === "staff");

  const modCtx = await getLiveRoomModeratorContext({ liveRoomId, userId: auth.userId });
  const isStaffActor = modCtx.isHost || modCtx.isModerator;
  if (wantStaff && !isStaffActor) {
    return NextResponse.json({ error: "Only the host or moderators can send staff chat." }, { status: 403 });
  }

  const slowMode = await getLiveRoomSlowModeSeconds(liveRoomId);
  if (slowMode > 0 && !isStaffActor) {
    const lastChat = await getLastChatAt(liveRoomId, auth.userId);
    if (lastChat && Date.now() - lastChat.getTime() < slowMode * 1000) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((slowMode * 1000 - (Date.now() - lastChat.getTime())) / 1000),
      );
      return NextResponse.json(
        { error: `Slow mode — wait ${waitSeconds}s between messages.` },
        { status: 429 },
      );
    }
  }

  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "Message body required." }, { status: 400 });

  /** Public chat or host/mod staff-only; bid/purchase/system remain server-side. */
  const messageType: LiveRoomMessageType = wantStaff ? "staff" : "chat";

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

  let row;
  try {
    row = await prisma.liveRoomMessage.create({
      data: {
        liveRoomId,
        senderId: auth.userId,
        body: text,
        messageType,
      },
      include: { sender: { select: { username: true, image: true } } },
    });
  } catch (e) {
    console.error("live room chat create failed", e);
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }

  // Staff chat must not notify buyers via @mentions.
  if (!wantStaff) {
    void processMessageMentions({
      db: prisma,
      sourceType: "live_room_message",
      sourceId: row.id,
      body: text,
      senderId: auth.userId,
      senderUsername: sender?.username ?? row.sender?.username ?? "user",
      liveRoomId,
      notifyHref: `/live/${encodeURIComponent(liveRoomId)}`,
      notifyContext: "Live show chat",
    });
  }

  void emitLiveRoomMessageById(row.id);

  return NextResponse.json({ message: serializeLiveRoomMessage(row, []) });
}
