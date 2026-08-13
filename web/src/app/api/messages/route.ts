import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { firstMessageNotification } from "@/lib/message-notification";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import {
  ensureThreadParticipants,
  listingAnchorKey,
  liveAnchorKey,
  profileAnchorKey,
  resolveInboxForNewThread,
  resolveLiveNetworkingListingAnchor,
  resolveProfileMessagingListingAnchor,
} from "@/lib/message-threads";
import { isUserBlocked } from "@/lib/user-block";
import type { MessageConversationKind } from "@/generated/prisma/client";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

type Body = {
  listingId?: string;
  liveRoomId?: string;
  recipientUserId?: string;
  sellerUserId?: string;
  offerId?: string;
  orderId?: string;
  conversationKind?: string;
  body?: unknown;
  imageUrl?: unknown;
};

function trimBody(s: unknown, max = 8000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

/** Photo attachment must be an https URL from our own upload endpoint's response. */
function trimImageUrl(s: unknown, max = 2000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  if (!t || !/^https:\/\//i.test(t)) return null;
  return t;
}

const KINDS = new Set<MessageConversationKind>([
  "buyer_seller",
  "offer_negotiation",
  "order_support",
  "trade",
  "live_networking",
]);

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const buyerId = auth.userId;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  const liveRoomId = typeof body.liveRoomId === "string" ? body.liveRoomId.trim() : "";
  const recipientUserId =
    (typeof body.recipientUserId === "string" ? body.recipientUserId.trim() : "") ||
    (typeof body.sellerUserId === "string" ? body.sellerUserId.trim() : "");
  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const text = trimBody(body.body, 8000) ?? "";
  const imageUrl = trimImageUrl(body.imageUrl);
  const conversationKind =
    typeof body.conversationKind === "string" && KINDS.has(body.conversationKind as MessageConversationKind)
      ? (body.conversationKind as MessageConversationKind)
      : liveRoomId
        ? "live_networking"
        : offerId
          ? "offer_negotiation"
          : orderId
            ? "order_support"
            : "buyer_seller";

  if (!text && !imageUrl) {
    return NextResponse.json({ error: "Enter a message or attach a photo." }, { status: 400 });
  }
  if (!listingId && !liveRoomId && !recipientUserId) {
    return NextResponse.json({ error: "Missing recipient, listing, or live show." }, { status: 400 });
  }

  try {
    // Resolve listing/seller/inbox OUTSIDE the interactive transaction. Doing follow/order/block
    // lookups + listing anchor upserts inside the default 5s Prisma transaction was timing out
    // in production (P2028) and surfacing as "Could not send message."
    let resolvedListingId = listingId;
    let sellerId: string;
    let anchorKey: string;
    let resolvedLiveRoomId: string | null = liveRoomId || null;
    let listingTitle = "";

    if (liveRoomId) {
      const room = await prisma.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: { id: true, sellerId: true, title: true },
      });
      if (!room) throw new Error("NOT_FOUND");
      sellerId = room.sellerId;
      anchorKey = liveAnchorKey(room.id);
      listingTitle = room.title;
      resolvedLiveRoomId = room.id;
      const anchor = await resolveLiveNetworkingListingAnchor(prisma, {
        liveRoomId: room.id,
        sellerId: room.sellerId,
        roomTitle: room.title,
      });
      resolvedListingId = anchor.listingId;
      if (!listingTitle.trim()) listingTitle = anchor.listingTitle;
    } else if (recipientUserId && !listingId) {
      const profileUser = await prisma.user.findUnique({
        where: { id: recipientUserId },
        select: { id: true, username: true },
      });
      if (!profileUser) throw new Error("NOT_FOUND");
      sellerId = profileUser.id;
      anchorKey = profileAnchorKey(profileUser.id);
      const profileLabel = profileUser.username ? `@${profileUser.username}` : "Direct message";
      const anchor = await resolveProfileMessagingListingAnchor(prisma, {
        profileUserId: profileUser.id,
        profileLabel,
      });
      resolvedListingId = anchor.listingId;
      listingTitle = anchor.listingTitle;
    } else {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, title: true, sellerId: true, status: true, moderationRemovedAt: true },
      });
      if (!listing) throw new Error("NOT_FOUND");
      if (listing.moderationRemovedAt) throw new Error("NOT_PUBLIC");
      if (listing.status !== "active" && listing.status !== "auction_live") {
        throw new Error("NOT_PUBLIC");
      }
      sellerId = listing.sellerId;
      resolvedListingId = listing.id;
      listingTitle = listing.title;
      anchorKey = listingAnchorKey(listing.id);
    }

    if (sellerId === buyerId) throw new Error("SELF");

    // A blocked user must not be able to bypass the block by starting a NEW thread via a
    // different listing/live/profile entry point (messaging security audit 2026-07).
    if (await isUserBlocked(prisma, buyerId, sellerId)) throw new Error("BLOCKED");

    const inbox = await resolveInboxForNewThread(buyerId, sellerId);

    const result = await prisma.$transaction(
      async (tx) => {
        const thread = await tx.messageThread.upsert({
          where: {
            buyerId_sellerId_anchorKey: {
              buyerId,
              sellerId,
              anchorKey,
            },
          },
          create: {
            buyerId,
            sellerId,
            listingId: resolvedListingId,
            anchorKey,
            conversationKind,
            inbox,
            offerId: offerId || null,
            orderId: orderId || null,
            liveRoomId: resolvedLiveRoomId,
          },
          update: {
            updatedAt: new Date(),
            offerId: offerId || undefined,
            orderId: orderId || undefined,
            liveRoomId: resolvedLiveRoomId || undefined,
          },
        });

        await ensureThreadParticipants(tx, thread.id, buyerId, sellerId);

        const created = await tx.message.create({
          data: {
            threadId: thread.id,
            senderId: buyerId,
            recipientId: sellerId,
            listingId: resolvedListingId,
            body: text,
            imageUrl,
            kind: "user",
          },
          select: { id: true },
        });

        await tx.messageThread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        });

        return { threadId: thread.id, inbox: thread.inbox, messageId: created.id };
      },
      { timeout: 15_000 },
    );

    const recipientParticipant = await prisma.messageThreadParticipant.findUnique({
      where: { threadId_userId: { threadId: result.threadId, userId: sellerId } },
      select: { muted: true },
    });

    if (!recipientParticipant?.muted) {
      const preview = text
        ? text.length > 120
          ? `${text.slice(0, 117)}…`
          : text
        : "📷 Sent a photo";
      const lt = listingTitle.length > 60 ? `${listingTitle.slice(0, 57)}…` : listingTitle;
      const notify = firstMessageNotification(result.inbox);
      const notifyBody =
        anchorKey.startsWith("profile:") || lt === "Direct message"
          ? preview
          : `Regarding “${lt}”: ${preview}`;
      void createNotification(prisma, {
        userId: sellerId,
        type: notify.type,
        title: notify.title,
        body: notifyBody,
        href: `/account/messages/${encodeURIComponent(result.threadId)}`,
      });
    }

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { username: true } });
    await processMessageMentions({
      db: prisma,
      sourceType: "thread_message",
      sourceId: result.messageId,
      body: text,
      senderId: buyerId,
      senderUsername: buyer?.username ?? "user",
      threadId: result.threadId,
      notifyHref: `/account/messages/${encodeURIComponent(result.threadId)}`,
      notifyContext: "Message thread",
    });

    return NextResponse.json({ threadId: result.threadId, inbox: result.inbox });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (code === "SELF") return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
    if (code === "BLOCKED") return NextResponse.json({ error: "You cannot message this user." }, { status: 403 });
    if (code === "NOT_PUBLIC" || code === "NO_LISTING") {
      return NextResponse.json(
        {
          error:
            code === "NO_LISTING"
              ? "This seller does not have a listing to attach yet. Try again after they add inventory."
              : "This listing is not available.",
        },
        { status: 409 },
      );
    }
    console.error("[messages POST]", e);
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
