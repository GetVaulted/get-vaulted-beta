import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import {
  conversationKindLabel,
  healRequestThreadsAcceptedByReply,
  offerStatusChip,
  orderStatusChip,
  resolveThreadContext,
} from "@/lib/message-threads";
import { loadParticipantBadges } from "@/lib/message-participant-badges";
import { purgeAtFor, threadVisibility } from "@/lib/message-thread-deletion";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  const url = new URL(req.url);
  const inboxParam = url.searchParams.get("inbox");
  // `deleted` = this person's Deleted area (kept 14 days, then removed for good).
  const inbox = inboxParam === "request" ? "request" : inboxParam === "deleted" ? "deleted" : "primary";

  // Move answered request threads into Inbox before listing so the folder switch is visible
  // on refresh (not only after opening an individual chat).
  await healRequestThreadsAcceptedByReply(uid);

  const allThreads = await prisma.messageThread.findMany({
    where:
      inbox === "deleted"
        ? {
            OR: [{ buyerId: uid }, { sellerId: uid }],
            participants: { some: { userId: uid, deletedAt: { not: null }, purgedAt: null } },
          }
        : {
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
      buyer: { select: { id: true, username: true, image: true, sellerLevel: true, emailVerified: true } },
      seller: { select: { id: true, username: true, image: true, sellerLevel: true, emailVerified: true } },
      participants: { where: { userId: uid } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, imageUrl: true, createdAt: true, kind: true, systemEvent: true },
      },
    },
  });

  // Delete is per person: only the conversations this person has not deleted (or that got a newer
  // message since) belong in Inbox / Requests; the rest live in Deleted.
  const threads = allThreads.filter((t) => {
    const visibility = threadVisibility(t.participants[0], t.messages[0]?.createdAt ?? null);
    return inbox === "deleted" ? visibility === "deleted" : visibility === "active";
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

  const badgeMap = await loadParticipantBadges(
    prisma,
    threads.map((t) => (t.buyerId === uid ? t.seller : t.buyer)),
  );

  const enriched = await Promise.all(
    threads.map(async (t) => {
      const other = t.buyerId === uid ? t.seller : t.buyer;
      const otherBadges = badgeMap.get(other.id);
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
        tradeOfferId: ctx.tradeOfferId ?? null,
        otherUserId: other.id,
        otherUsername: other.username,
        otherAvatarUrl: other.image,
        otherSellerLevelLabel: otherBadges?.sellerLevelLabel ?? null,
        otherVerified: otherBadges?.verified ?? false,
        lastPreview: last?.body || (last?.imageUrl ? "📷 Photo" : ""),
        lastAt: last ? last.createdAt.toISOString() : t.updatedAt.toISOString(),
        lastKind: last?.kind ?? "user",
        unreadCount: unreadMap.get(t.id) ?? 0,
        deletedAt: participant?.deletedAt ? participant.deletedAt.toISOString() : null,
        purgeAt: participant?.deletedAt ? purgeAtFor(participant.deletedAt).toISOString() : null,
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

  let requestCount = 0;
  if (inbox === "primary") {
    const requestThreads = await prisma.messageThread.findMany({
      where: { OR: [{ buyerId: uid }, { sellerId: uid }], inbox: "request" },
      select: {
        participants: { where: { userId: uid }, select: { deletedAt: true, purgedAt: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });
    requestCount = requestThreads.filter(
      (t) => threadVisibility(t.participants[0], t.messages[0]?.createdAt ?? null) === "active",
    ).length;
  }

  return NextResponse.json({ threads: enriched, requestCount });
}
