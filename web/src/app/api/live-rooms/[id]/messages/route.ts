import { NextResponse } from "next/server";
import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { loadMentionsForSources, loadMentionsForSource } from "@/lib/mentions/load-message-mentions";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";
import { createTtlCache } from "@/lib/ttl-cache";
import { resolveChatSenderId } from "@/lib/live-room-chat-auth";
import { resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomMessageDtoAndWait } from "@/lib/realtime-emit-server";
import { parseMentionUsernames } from "@/lib/mentions/parse-mentions";
import { LIVE_ROOM_CHAT_HISTORY_MAX, liveRoomChatOpen } from "@/lib/live-room-chat-policy";
import {
  filterStaffMessagesForViewer,
  viewerCanAccessStaffChatCached,
} from "@/lib/live-room-staff-chat";
import {
  getLastChatAt,
  getLiveRoomModeratorContext,
  getLiveRoomUserRestrictions,
} from "@/lib/trust/live-room-moderation";

/**
 * Chat history is the heaviest read in a live room: every viewer reloads it on a timer (and on any
 * reconnect), and each load is a 300-row join plus mention lookups. New messages reach viewers over
 * realtime, so this endpoint is the catch-up path and can be a second or two stale. One load is shared
 * by every viewer on a server instance for CHAT_HISTORY_CACHE_MS.
 */
const CHAT_HISTORY_CACHE_MS = 1_500;
const chatHistoryCache = createTtlCache<
  { notFound: true } | { notFound: false; messages: ReturnType<typeof serializeLiveRoomMessage>[] }
>();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const viewerId = await resolveOptionalLiveRoomsUserId(req);
  const canSeeStaff = await viewerCanAccessStaffChatCached({ liveRoomId, userId: viewerId });

  const result = await chatHistoryCache.get(`${liveRoomId}:${canSeeStaff ? "staff" : "public"}`, CHAT_HISTORY_CACHE_MS, async () => {
    const exists = await prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { id: true } });
    if (!exists) return { notFound: true as const };

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
    return { notFound: false as const, messages };
  });

  if (result.notFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ messages: result.messages });
}

type PostBody = {
  body?: string;
  messageType?: string;
  /** When true (host/mod only), message is staff-only. */
  staffOnly?: boolean;
  clientMessageId?: string;
};

const CHAT_DUPLICATE_WINDOW_MS = 5000;

/** Never let a slow realtime hop hold the sender's request open for long. */
const BROADCAST_WAIT_CAP_MS = 2500;

function withCap<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Chat send, tuned for speed: the sender already shows the message instantly, so what matters is how
 * soon everyone ELSE sees it. That is: few database round trips before the insert, then a broadcast
 * built from the row we just wrote (no re-read) that finishes before the function returns, so a
 * serverless runtime cannot freeze it half-sent.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveChatSenderId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  // One room read serves the status check, restrictions, moderator check and slow mode.
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, status: true, sellerId: true, slowModeSeconds: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }
  if (!liveRoomChatOpen(room.status)) {
    return NextResponse.json({ error: "Chat is not available for this room." }, { status: 409 });
  }

  let body: PostBody | null = null;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    body = null;
  }

  const wantStaff =
    body?.staffOnly === true ||
    (typeof body?.messageType === "string" && body.messageType.trim().toLowerCase() === "staff");
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  /** Public chat or host/mod staff-only; bid/purchase/system remain server-side. */
  const messageType: LiveRoomMessageType = wantStaff ? "staff" : "chat";
  const slowMode = Math.max(0, room.slowModeSeconds ?? 0);

  const [restrictions, modCtx, duplicate, lastChat] = await Promise.all([
    getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId, room }),
    getLiveRoomModeratorContext({ liveRoomId, userId: auth.userId, room }),
    text
      ? prisma.liveRoomMessage.findFirst({
          where: {
            liveRoomId,
            senderId: auth.userId,
            body: text,
            messageType,
            createdAt: { gte: new Date(Date.now() - CHAT_DUPLICATE_WINDOW_MS) },
          },
          orderBy: { createdAt: "desc" },
          include: { sender: { select: { username: true, image: true } } },
        })
      : Promise.resolve(null),
    slowMode > 0 ? getLastChatAt(liveRoomId, auth.userId) : Promise.resolve(null),
  ]);

  if (restrictions.roomBanned || restrictions.kickedUntil || restrictions.sellerStreamBanned) {
    return NextResponse.json({ error: "You cannot participate in this room." }, { status: 403 });
  }
  if (restrictions.muted) {
    return NextResponse.json({ error: "You are muted in this room." }, { status: 403 });
  }
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const isStaffActor = modCtx.isHost || modCtx.isModerator;
  if (wantStaff && !isStaffActor) {
    return NextResponse.json({ error: "Only the host or moderators can send staff chat." }, { status: 403 });
  }

  if (slowMode > 0 && !isStaffActor) {
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

  if (!text) return NextResponse.json({ error: "Message body required." }, { status: 400 });

  if (duplicate) {
    const mentions = await loadMentionsForSource("live_room_message", duplicate.id);
    return NextResponse.json({ message: serializeLiveRoomMessage(duplicate, mentions) });
  }

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

  // Staff chat must not notify buyers via @mentions. Only messages that actually @ someone pay for
  // the mention work; everything else broadcasts straight away.
  let mentions: { userId: string; username: string }[] = [];
  if (!wantStaff && parseMentionUsernames(text).length > 0) {
    mentions = await processMessageMentions({
      db: prisma,
      sourceType: "live_room_message",
      sourceId: row.id,
      body: text,
      senderId: auth.userId,
      senderUsername: row.sender?.username ?? "user",
      liveRoomId,
      notifyHref: `/live/${encodeURIComponent(liveRoomId)}`,
      notifyContext: "Live show chat",
    });
  }

  const message = serializeLiveRoomMessage(row, mentions);
  await withCap(
    emitLiveRoomMessageDtoAndWait(liveRoomId, message).catch((e) => console.error("live room chat broadcast failed", e)),
    BROADCAST_WAIT_CAP_MS,
  );

  return NextResponse.json({ message });
}
