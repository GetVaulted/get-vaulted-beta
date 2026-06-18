import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { loadMentionsForSources } from "@/lib/mentions/load-message-mentions";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import {
  conversationKindLabel,
  offerStatusChip,
  orderStatusChip,
  resolveThreadContext,
} from "@/lib/message-threads";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

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

  await prisma.message.updateMany({
    where: { threadId, recipientId: uid, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      body: true,
      kind: true,
      systemEvent: true,
      readAt: true,
      createdAt: true,
    },
  });

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
      inbox: thread.inbox,
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

  const selfParticipant = thread.participants[0];
  if (selfParticipant?.blocked) {
    return NextResponse.json({ error: "You cannot message in this thread." }, { status: 403 });
  }

  if (thread.inbox === "request" && thread.sellerId !== uid) {
    return NextResponse.json(
      { error: "Waiting for the seller to accept your message request." },
      { status: 403 },
    );
  }

  const recipientId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

  const otherParticipant = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: recipientId } },
  });
  if (otherParticipant?.blocked) {
    return NextResponse.json({ error: "Message could not be delivered." }, { status: 403 });
  }

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
      data: { updatedAt: new Date() },
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

  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  await createNotification(prisma, {
    userId: recipientId,
    type: "message_received",
    title: "New message",
    body: preview,
    href: `/account/messages/${encodeURIComponent(thread.id)}`,
  });

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
