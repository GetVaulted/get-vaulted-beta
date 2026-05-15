import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId: raw } = await ctx.params;
  const threadId = decodeURIComponent(raw);
  const uid = session.user.id;

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [{ buyerId: uid }, { sellerId: uid }],
    },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, username: true } },
      seller: { select: { id: true, username: true } },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.message.updateMany({
    where: {
      threadId,
      recipientId: uid,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
  });

  const other = thread.buyerId === uid ? thread.seller : thread.buyer;

  return NextResponse.json({
    thread: {
      id: thread.id,
      listingId: thread.listingId,
      listingTitle: thread.listing.title,
      otherUserId: other.id,
      otherUsername: other.username,
    },
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
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
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId: raw } = await ctx.params;
  const threadId = decodeURIComponent(raw);
  const uid = session.user.id;

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
    select: { id: true, buyerId: true, sellerId: true, listingId: true },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recipientId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        threadId: thread.id,
        senderId: uid,
        recipientId,
        listingId: thread.listingId,
        body: text,
      },
      select: { id: true, createdAt: true },
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    return m;
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
      readAt: null as string | null,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
