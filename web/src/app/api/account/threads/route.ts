import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import {
  conversationKindLabel,
  healRequestThreadsAcceptedByReply,
  offerStatusChip,
  orderStatusChip,
  resolveThreadContext,
} from "@/lib/message-threads";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  const url = new URL(req.url);
  const inbox = url.searchParams.get("inbox") === "request" ? "request" : "primary";

  // Move answered request threads into Inbox before listing so the folder switch is visible
  // on refresh (not only after opening an individual chat).
  await healRequestThreadsAcceptedByReply(uid);

  const threads = await prisma.messageThread.findMany({
    where: {
      OR: [{ buyerId: uid }, { sellerId: uid }],
      inbox,
    },
    orderBy: [{ updatedAt: "desc" }],
    // Defensive cap — no pagination UI yet (see performance audit 2026-07).
    take: 300,
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
        },
      },
      buyer: { select: { id: true, username: true, image: true } },
      seller: { select: { id: true, username: true, image: true } },
      participants: { where: { userId: uid } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, kind: true, systemEvent: true },
      },
    },
  });

  const ids = threads.map((t) => t.id);
  const unreadGroups =
    ids.length === 0
      ? []
      : await prisma.message.groupBy({
          by: ["threadId"],
          where: {
            threadId: { in: ids },
            recipientId: uid,
            readAt: null,
          },
          _count: { _all: true },
        });
  const unreadMap = new Map(unreadGroups.map((g) => [g.threadId, g._count._all]));

  const offerIds = threads.map((t) => t.offerId).filter(Boolean) as string[];
  const orderIds = threads.map((t) => t.orderId).filter(Boolean) as string[];
  const [offers, orders] = await Promise.all([
    offerIds.length
      ? prisma.offer.findMany({
          where: { id: { in: offerIds } },
          select: { id: true, status: true, amountUsd: true },
        })
      : [],
    orderIds.length
      ? prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, status: true },
        })
      : [],
  ]);
  const offerMap = new Map(offers.map((o) => [o.id, o]));
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const enriched = await Promise.all(
    threads.map(async (t) => {
      const other = t.buyerId === uid ? t.seller : t.buyer;
      const last = t.messages[0];
      const participant = t.participants[0];
      const ctx = await resolveThreadContext(t);
      const offer = t.offerId ? offerMap.get(t.offerId) ?? null : null;
      const order = t.orderId ? orderMap.get(t.orderId) ?? null : null;

      return {
        id: t.id,
        inbox: t.inbox,
        conversationKind: t.conversationKind,
        conversationLabel: conversationKindLabel(t.conversationKind),
        listingId: t.listingId,
        listingTitle: t.listing.title,
        contextHeadline: ctx.headline,
        contextSubline: ctx.subline,
        thumbnailUrl: ctx.thumbnailUrl ?? t.listing.images[0]?.url ?? null,
        offerId: t.offerId,
        orderId: t.orderId,
        liveRoomId: t.liveRoomId,
        otherUserId: other.id,
        otherUsername: other.username,
        otherAvatarUrl: other.image,
        lastPreview: last?.body ?? "",
        lastAt: last ? last.createdAt.toISOString() : t.updatedAt.toISOString(),
        lastKind: last?.kind ?? "user",
        unreadCount: unreadMap.get(t.id) ?? 0,
        pinned: Boolean(participant?.pinnedAt),
        starred: participant?.starred ?? false,
        muted: participant?.muted ?? false,
        offerStatus: offerStatusChip(offer),
        orderStatus: orderStatusChip(order),
        isSeller: t.sellerId === uid,
      };
    }),
  );

  enriched.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
  });

  const requestCount =
    inbox === "primary"
      ? await prisma.messageThread.count({
          where: { OR: [{ buyerId: uid }, { sellerId: uid }], inbox: "request" },
        })
      : 0;

  return NextResponse.json({ threads: enriched, requestCount });
}
