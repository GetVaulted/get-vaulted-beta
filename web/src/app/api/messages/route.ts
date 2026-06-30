import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import {
  ensureThreadParticipants,
  listingAnchorKey,
  liveAnchorKey,
  resolveInboxForNewThread,
  resolveLiveNetworkingListingAnchor,
} from "@/lib/message-threads";
import type { MessageConversationKind } from "@/generated/prisma/client";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

type Body = {
  listingId?: string;
  liveRoomId?: string;
  offerId?: string;
  orderId?: string;
  conversationKind?: string;
  body?: unknown;
};

function trimBody(s: unknown, max = 8000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
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
  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const text = trimBody(body.body, 8000);
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

  if (!text) return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  if (!listingId && !liveRoomId) {
    return NextResponse.json({ error: "Missing listing or live show." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let resolvedListingId = listingId;
      let sellerId: string;
      let anchorKey: string;
      let resolvedLiveRoomId: string | null = liveRoomId || null;
      let listingTitle = "";

      if (liveRoomId) {
        const room = await tx.liveRoom.findUnique({
          where: { id: liveRoomId },
          select: { id: true, sellerId: true, title: true },
        });
        if (!room) throw new Error("NOT_FOUND");
        sellerId = room.sellerId;
        anchorKey = liveAnchorKey(room.id);
        listingTitle = room.title;
        resolvedLiveRoomId = room.id;
        const anchor = await resolveLiveNetworkingListingAnchor(tx, {
          liveRoomId: room.id,
          sellerId: room.sellerId,
          roomTitle: room.title,
        });
        resolvedListingId = anchor.listingId;
        if (!listingTitle.trim()) listingTitle = anchor.listingTitle;
      } else {
        const listing = await tx.listing.findUnique({
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

      const inbox = await resolveInboxForNewThread(buyerId, sellerId);

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
          kind: "user",
        },
        select: { id: true },
      });

      await tx.messageThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      const lt = listingTitle.length > 60 ? `${listingTitle.slice(0, 57)}…` : listingTitle;
      await createNotification(tx, {
        userId: sellerId,
        type: "message_received",
        title: inbox === "request" ? "Message request" : "New message",
        body: `Regarding “${lt}”: ${preview}`,
        href: `/account/messages/${encodeURIComponent(thread.id)}`,
      });

      return { threadId: thread.id, inbox: thread.inbox, messageId: created.id };
    });

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
