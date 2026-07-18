import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { REPLY_MESSAGE_NOTIFICATION } from "@/lib/message-notification";
import { loadMentionsForSources } from "@/lib/mentions/load-message-mentions";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import {
  conversationKindLabel,
  offerStatusChip,
  orderStatusChip,
  resolveThreadContext,
} from "@/lib/message-threads";
import { isUserBlocked } from "@/lib/user-block";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

/** Default/backward-compatible page size — short threads load in one page, unchanged. */
const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 200;

export async function GET(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  const { threadId: raw } = await ctx.params;
  const threadId = decodeURIComponent(raw);

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [{ buyerId: uid }, { sellerId: uid }],
    },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, username: true, image: true } },
      seller: { select: { id: true, username: true, image: true } },
      participants: { where: { userId: uid } },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const participant = thread.participants[0];
  if (participant?.blocked) {
    return NextResponse.json({ error: "Conversation unavailable." }, { status: 403 });
  }

  // Heal stuck request threads: recipient replied without tapping Accept → promote to primary
  // so the initiator's composer unlocks on open (not only on their next send attempt).
  let inbox = thread.inbox;
  if (inbox === "request") {
    const recipientReplied = await prisma.message.findFirst({
      where: { threadId, senderId: thread.sellerId, kind: "user" },
      select: { id: true },
    });
    if (recipientReplied) {
      await prisma.messageThread.update({
        where: { id: threadId },
        data: { inbox: "primary" },
      });
      inbox = "primary";
    }
  }

  await prisma.message.updateMany({
    where: { threadId, recipientId: uid, readAt: null },
    data: { readAt: new Date() },
  });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_MESSAGE_PAGE_SIZE);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_MESSAGE_PAGE_SIZE, Math.max(1, Math.floor(limitRaw)))
    : DEFAULT_MESSAGE_PAGE_SIZE;
  // Cursor = id of the oldest message already loaded; loads the page just before it.
  const beforeMessageId = url.searchParams.get("before")?.trim() || null;

  const messageSelect = {
    id: true,
    senderId: true,
    body: true,
    kind: true,
    systemEvent: true,
    readAt: true,
    createdAt: true,
  } as const;

  // Fetch newest-first so pagination always returns the most recent N by default
  // (long-running commerce threads previously loaded every message with no limit). `id` is a
  // secondary sort key so ordering stays fully deterministic when multiple messages share the
  // same `createdAt` millisecond (e.g. a rapid system-message burst) — without it, "load earlier"
  // could skip or duplicate a message across paginated requests since the DB is free to return
  // tied rows in any order.
  const descPage = await prisma.message.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(beforeMessageId ? { cursor: { id: beforeMessageId }, skip: 1 } : {}),
    select: messageSelect,
  });
  const hasMore = descPage.length > limit;
  const messages = descPage.slice(0, limit).reverse();
  const nextCursor = hasMore ? messages[0]?.id ?? null : null;

  const mentionMap = await loadMentionsForSources(
    "thread_message",
    messages.map((m) => m.id),
  );

  const other = thread.buyerId === uid ? thread.seller : thread.buyer;
  const ctxLabel = await resolveThreadContext(thread);

  const [offer, order] = await Promise.all([
    thread.offerId
      ? prisma.offer.findUnique({
          where: { id: thread.offerId },
          select: { id: true, status: true, amountUsd: true },
        })
      : null,
    thread.orderId
      ? prisma.order.findUnique({
          where: { id: thread.orderId },
          select: { id: true, status: true },
        })
      : null,
  ]);

  return NextResponse.json({
    thread: {
      id: thread.id,
      inbox,
      conversationKind: thread.conversationKind,
      conversationLabel: conversationKindLabel(thread.conversationKind),
      listingId: thread.listingId,
      listingTitle: thread.listing.title,
      contextHeadline: ctxLabel.headline,
      contextSubline: ctxLabel.subline,
      thumbnailUrl: ctxLabel.thumbnailUrl ?? null,
      offerId: thread.offerId,
      orderId: thread.orderId,
      liveRoomId: thread.liveRoomId,
      otherUserId: other.id,
      otherUsername: other.username,
      otherAvatarUrl: other.image,
      isSeller: thread.sellerId === uid,
      pinned: Boolean(participant?.pinnedAt),
      starred: participant?.starred ?? false,
      muted: participant?.muted ?? false,
      offerStatus: offerStatusChip(offer),
      orderStatus: orderStatusChip(order),
    },
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      kind: m.kind,
      systemEvent: m.systemEvent,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      mentions: mentionMap.get(m.id) ?? [],
    })),
    hasMore,
    nextCursor,
  });
}

type PostBody = { body?: unknown };

function trimBody(s: unknown, max = 8000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  const { threadId: raw } = await ctx.params;
  const threadId = decodeURIComponent(raw);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = trimBody(body.body, 8000);
  if (!text) return NextResponse.json({ error: "Enter a message." }, { status: 400 });

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [{ buyerId: uid }, { sellerId: uid }],
    },
    include: { participants: { where: { userId: uid } } },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Request-folder threads: only the recipient (`sellerId`) may speak until accepted.
  // If they already replied earlier without tapping Accept, treat that as acceptance and heal.
  if (thread.inbox === "request" && thread.sellerId !== uid) {
    const recipientAlreadyReplied = await prisma.message.findFirst({
      where: { threadId, senderId: thread.sellerId, kind: "user" },
      select: { id: true },
    });
    if (recipientAlreadyReplied) {
      await prisma.messageThread.update({
        where: { id: threadId },
        data: { inbox: "primary" },
      });
      thread.inbox = "primary";
    } else {
      return NextResponse.json(
        { error: "Waiting for them to accept your message request." },
        { status: 403 },
      );
    }
  }

  const recipientId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

  // Checks both directions (sender blocked recipient, or recipient blocked sender) via the
  // durable cross-thread UserBlock table plus legacy per-thread flags on any prior thread.
  if (await isUserBlocked(prisma, uid, recipientId)) {
    return NextResponse.json({ error: "Message could not be delivered." }, { status: 403 });
  }

  const recipientParticipant = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: recipientId } },
    select: { muted: true },
  });

  // Replying as the request recipient implicitly accepts the request (no separate Accept tap).
  const acceptOnSend = thread.inbox === "request" && thread.sellerId === uid;

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        threadId: thread.id,
        senderId: uid,
        recipientId,
        listingId: thread.listingId,
        body: text,
        kind: "user",
      },
      select: { id: true, createdAt: true },
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
        ...(acceptOnSend ? { inbox: "primary" as const } : {}),
      },
    });

    return m;
  });

  const sender = await prisma.user.findUnique({ where: { id: uid }, select: { username: true } });
  const mentions = await processMessageMentions({
    db: prisma,
    sourceType: "thread_message",
    sourceId: msg.id,
    body: text,
    senderId: uid,
    senderUsername: sender?.username ?? "user",
    threadId: thread.id,
    notifyHref: `/account/messages/${encodeURIComponent(thread.id)}`,
    notifyContext: "Message thread",
  });

  if (!recipientParticipant?.muted) {
    const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    await createNotification(prisma, {
      userId: recipientId,
      type: REPLY_MESSAGE_NOTIFICATION.type,
      title: REPLY_MESSAGE_NOTIFICATION.title,
      body: preview,
      href: `/account/messages/${encodeURIComponent(thread.id)}`,
    });
  }

  return NextResponse.json({
    message: {
      id: msg.id,
      senderId: uid,
      body: text,
      kind: "user" as const,
      systemEvent: null,
      readAt: null as string | null,
      createdAt: msg.createdAt.toISOString(),
      mentions,
    },
  });
}
