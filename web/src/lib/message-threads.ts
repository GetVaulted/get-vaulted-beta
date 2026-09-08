import type {
  MessageConversationKind,
  MessageThread,
  MessageThreadInbox,
  Offer,
  Order,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export function profileAnchorKey(userId: string): string {
  return `profile:${userId}`;
}

export function profileMessagingAnchorWorkspaceKey(userId: string): string {
  return `profile-dm:${userId}`;
}

type MessageDb = Prisma.TransactionClient | typeof prisma;

/** Hidden listing anchor so profile DMs work without an active marketplace listing. */
export async function resolveProfileMessagingListingAnchor(
  tx: MessageDb,
  args: { profileUserId: string; profileLabel?: string },
): Promise<{ listingId: string; listingTitle: string }> {
  const sellerListing = await tx.listing.findFirst({
    where: { sellerId: args.profileUserId, moderationRemovedAt: null, status: { in: ["active", "auction_live"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (sellerListing) return { listingId: sellerListing.id, listingTitle: sellerListing.title };

  const workspaceKey = profileMessagingAnchorWorkspaceKey(args.profileUserId);
  const anchor = await tx.listing.upsert({
    where: { sellerId_workspaceKey: { sellerId: args.profileUserId, workspaceKey } },
    create: {
      sellerId: args.profileUserId,
      workspaceKey,
      title: (args.profileLabel?.trim() || "Direct message").slice(0, 200),
      description: "Private messages from your Get Vaulted profile.",
      category: "Direct",
      condition: "N/A",
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 0,
      shippingPriceUsd: 0,
    },
    update: {},
    select: { id: true, title: true },
  });
  return { listingId: anchor.id, listingTitle: anchor.title };
}

export function listingAnchorKey(listingId: string): string {
  return `listing:${listingId}`;
}

export function liveAnchorKey(liveRoomId: string): string {
  return `live:${liveRoomId}`;
}

export function liveMessagingAnchorWorkspaceKey(liveRoomId: string): string {
  return `live-networking:${liveRoomId}`;
}

/** Listing row required by MessageThread FK — attach show inventory or create a hidden anchor. */
export async function resolveLiveNetworkingListingAnchor(
  tx: MessageDb,
  args: { liveRoomId: string; sellerId: string; roomTitle: string },
): Promise<{ listingId: string; listingTitle: string }> {
  const itemRows = await tx.liveRoomItem.findMany({
    where: { liveRoomId: args.liveRoomId, listingId: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { listingId: true },
    take: 24,
  });
  for (const row of itemRows) {
    const listingId = row.listingId?.trim();
    if (!listingId) continue;
    const listing = await tx.listing.findFirst({
      where: { id: listingId, sellerId: args.sellerId, moderationRemovedAt: null },
      select: { id: true, title: true },
    });
    if (listing) return { listingId: listing.id, listingTitle: listing.title };
  }

  const sellerListing = await tx.listing.findFirst({
    where: { sellerId: args.sellerId, moderationRemovedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (sellerListing) return { listingId: sellerListing.id, listingTitle: sellerListing.title };

  const workspaceKey = liveMessagingAnchorWorkspaceKey(args.liveRoomId);
  const anchor = await tx.listing.upsert({
    where: { sellerId_workspaceKey: { sellerId: args.sellerId, workspaceKey } },
    create: {
      sellerId: args.sellerId,
      workspaceKey,
      title: (args.roomTitle.trim() || "Live show").slice(0, 200),
      description: "Private messages about this live show.",
      category: "Live",
      condition: "See show",
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 0,
      shippingPriceUsd: 0,
    },
    update: {},
    select: { id: true, title: true },
  });
  return { listingId: anchor.id, listingTitle: anchor.title };
}

export function orderAnchorKey(orderId: string): string {
  return `order:${orderId}`;
}

export function tradeAnchorKey(tradeOfferId: string): string {
  return `trade:${tradeOfferId}`;
}

export function parseTradeOfferIdFromAnchorKey(anchorKey: string | null | undefined): string | null {
  const raw = anchorKey?.trim() ?? "";
  if (!raw.startsWith("trade:")) return null;
  const id = raw.slice("trade:".length).trim();
  return id || null;
}

export type ThreadContextLabel = {
  headline: string;
  subline?: string;
  thumbnailUrl?: string;
  listingId?: string;
  offerId?: string;
  orderId?: string;
  liveRoomId?: string;
  /** Trade Center offer id when this is a trade-linked thread. */
  tradeOfferId?: string;
};

export function conversationKindLabel(kind: MessageConversationKind): string {
  switch (kind) {
    case "offer_negotiation":
      return "Offer";
    case "order_support":
      return "Order";
    case "trade":
      return "Trade";
    case "live_networking":
      return "Live show";
    case "system":
      return "Vault";
    default:
      return "Listing";
  }
}

export async function resolveThreadContext(
  thread: Pick<
    MessageThread,
    "listingId" | "offerId" | "orderId" | "liveRoomId" | "conversationKind" | "anchorKey" | "id"
  >,
): Promise<ThreadContextLabel> {
  if (thread.conversationKind === "trade") {
    const fromAnchor = parseTradeOfferIdFromAnchorKey(thread.anchorKey);
    const tradeOffer = fromAnchor
      ? await prisma.tradeOffer.findUnique({
          where: { id: fromAnchor },
          select: {
            id: true,
            status: true,
            targetListing: {
              select: { title: true, images: { take: 1, orderBy: { sortOrder: "asc" } } },
            },
          },
        })
      : await prisma.tradeOffer.findFirst({
          where: { conversationId: thread.id },
          select: {
            id: true,
            status: true,
            targetListing: {
              select: { title: true, images: { take: 1, orderBy: { sortOrder: "asc" } } },
            },
          },
        });
    if (tradeOffer) {
      return {
        headline: tradeOffer.targetListing.title,
        subline: `Trade · ${tradeOffer.status.replace(/_/g, " ")}`,
        thumbnailUrl: tradeOffer.targetListing.images[0]?.url,
        listingId: thread.listingId,
        tradeOfferId: tradeOffer.id,
      };
    }
  }

  if (thread.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: thread.orderId },
      select: {
        id: true,
        listing: { select: { title: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } },
        status: true,
      },
    });
    if (order) {
      return {
        headline: order.listing.title,
        subline: `Order · ${order.status.replace(/_/g, " ")}`,
        thumbnailUrl: order.listing.images[0]?.url,
        listingId: thread.listingId,
        orderId: thread.orderId,
      };
    }
  }

  if (thread.offerId) {
    const offer = await prisma.offer.findUnique({
      where: { id: thread.offerId },
      select: {
        id: true,
        status: true,
        amountUsd: true,
        listing: { select: { title: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (offer) {
      return {
        headline: offer.listing.title,
        subline: `Offer $${offer.amountUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${offer.status}`,
        thumbnailUrl: offer.listing.images[0]?.url,
        listingId: thread.listingId,
        offerId: thread.offerId,
      };
    }
  }

  if (thread.liveRoomId) {
    const room = await prisma.liveRoom.findUnique({
      where: { id: thread.liveRoomId },
      select: { id: true, title: true, thumbnailUrl: true },
    });
    if (room) {
      return {
        headline: room.title,
        subline: "Live event",
        thumbnailUrl: room.thumbnailUrl || undefined,
        liveRoomId: room.id,
        listingId: thread.listingId,
      };
    }
  }

  const listing = await prisma.listing.findUnique({
    where: { id: thread.listingId },
    select: { title: true, images: { take: 1, orderBy: { sortOrder: "asc" } } },
  });

  return {
    headline: listing?.title ?? "Conversation",
    subline: conversationKindLabel(thread.conversationKind),
    thumbnailUrl: listing?.images[0]?.url,
    listingId: thread.listingId,
  };
}

/**
 * Two users "mutually follow" when each has a SellerFollow row pointing at the other. This is the
 * primary trust signal for messaging: if they follow each other, a new DM should land straight in
 * the inbox instead of the request folder.
 */
export async function usersMutuallyFollow(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const [aFollowsB, bFollowsA] = await Promise.all([
    prisma.sellerFollow.count({ where: { followerId: userA, sellerId: userB } }),
    prisma.sellerFollow.count({ where: { followerId: userB, sellerId: userA } }),
  ]);
  return aFollowsB > 0 && bFollowsA > 0;
}

/**
 * Where a brand-new thread should land:
 *  - Inbox (`primary`) when the two accounts follow each other, OR there's prior trust between them
 *    (an accepted thread, any order in either direction, or an offer from buyer to seller).
 *  - Otherwise the message is a cold contact and lands in `request` until the recipient accepts.
 */
export async function resolveInboxForNewThread(
  buyerId: string,
  sellerId: string,
): Promise<MessageThreadInbox> {
  const [mutualFollow, priorThread, priorOrder, priorOffer] = await Promise.all([
    usersMutuallyFollow(buyerId, sellerId),
    prisma.messageThread.count({
      where: {
        buyerId,
        sellerId,
        inbox: "primary",
      },
    }),
    prisma.order.count({
      where: {
        OR: [
          { buyerId, sellerId },
          { buyerId: sellerId, sellerId: buyerId },
        ],
      },
    }),
    prisma.offer.count({
      where: { buyerId, sellerId },
    }),
  ]);

  if (mutualFollow || priorThread > 0 || priorOrder > 0 || priorOffer > 0) {
    return "primary";
  }
  return "request";
}

/**
 * Promote request-folder threads to Inbox when the recipient (`sellerId`) already sent a user
 * message — reply is an implicit accept. Runs on inbox list loads so chats leave Requests without
 * requiring an explicit Accept tap or opening the thread first.
 */
export async function healRequestThreadsAcceptedByReply(userId: string): Promise<number> {
  if (!userId) return 0;

  const requestThreads = await prisma.messageThread.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      inbox: "request",
    },
    select: { id: true, sellerId: true },
    take: 300,
  });
  if (requestThreads.length === 0) return 0;

  const replied = await prisma.message.findMany({
    where: {
      kind: "user",
      OR: requestThreads.map((t) => ({
        threadId: t.id,
        senderId: t.sellerId,
      })),
    },
    select: { threadId: true },
    distinct: ["threadId"],
  });
  if (replied.length === 0) return 0;

  const ids = replied.map((m) => m.threadId);
  const result = await prisma.messageThread.updateMany({
    where: { id: { in: ids }, inbox: "request" },
    data: { inbox: "primary" },
  });
  return result.count;
}

export async function ensureThreadParticipants(
  tx: Prisma.TransactionClient,
  threadId: string,
  buyerId: string,
  sellerId: string,
) {
  await tx.messageThreadParticipant.upsert({
    where: { threadId_userId: { threadId, userId: buyerId } },
    create: { threadId, userId: buyerId },
    update: {},
  });
  await tx.messageThreadParticipant.upsert({
    where: { threadId_userId: { threadId, userId: sellerId } },
    create: { threadId, userId: sellerId },
    update: {},
  });
}

/**
 * Clears `deletedAt` for both participants of a thread when a real message is sent into it. A
 * thread either side trashed should resurface for them if the conversation becomes active again —
 * but only on an actual new message, not just from viewing/linking the thread (e.g. opening trade
 * terms), which is why this is separate from `ensureThreadParticipants` and only called from the
 * genuine message-creation call sites.
 */
export async function restoreThreadForNewMessage(
  tx: Prisma.TransactionClient,
  threadId: string,
  senderId: string,
  recipientId: string,
) {
  await tx.messageThreadParticipant.updateMany({
    where: { threadId, userId: { in: [senderId, recipientId] }, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
}

export function systemMessageBody(event: string): string {
  switch (event) {
    case "offer_accepted":
      return "Offer accepted — complete checkout when you're ready.";
    case "payment_received":
      return "Payment received. The seller will prepare your shipment.";
    case "item_shipped":
      return "Your item has shipped. Tracking is available in your order.";
    case "auction_won":
      return "You won the auction. Complete payment to secure the item.";
    case "trade_pending":
      return "Trade chat opened. Offer terms in Trade Center stay authoritative — use this thread to coordinate.";
    default:
      return "Vault update";
  }
}

export async function appendSystemMessage(
  tx: Prisma.TransactionClient,
  params: {
    threadId: string;
    recipientId: string;
    senderId: string;
    listingId: string;
    systemEvent: string;
  },
) {
  const body = systemMessageBody(params.systemEvent);
  await tx.message.create({
    data: {
      threadId: params.threadId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      listingId: params.listingId,
      kind: "system",
      systemEvent: params.systemEvent,
      body,
    },
  });
  await tx.messageThread.update({
    where: { id: params.threadId },
    data: { updatedAt: new Date() },
  });
}

export type TradeOfferThreadSource = {
  id: string;
  proposerId: string;
  recipientId: string;
  targetListingId: string;
  conversationId: string | null;
};

/**
 * Idempotently open a participant-scoped MessageThread for a TradeOffer and link `conversationId`.
 * Chat is supplemental — offer terms remain authoritative in Trade Center.
 */
export async function ensureTradeOfferThread(
  tx: Prisma.TransactionClient,
  args: { offer: TradeOfferThreadSource; actorUserId: string },
): Promise<{ threadId: string; created: boolean }> {
  const { offer, actorUserId } = args;
  if (actorUserId !== offer.proposerId && actorUserId !== offer.recipientId) {
    throw new Error("TRADE_THREAD_FORBIDDEN");
  }

  const buyerId = offer.proposerId;
  const sellerId = offer.recipientId;
  const anchorKey = tradeAnchorKey(offer.id);

  if (offer.conversationId) {
    const linked = await tx.messageThread.findUnique({
      where: { id: offer.conversationId },
      select: { id: true, buyerId: true, sellerId: true, conversationKind: true },
    });
    if (
      linked &&
      linked.conversationKind === "trade" &&
      ((linked.buyerId === buyerId && linked.sellerId === sellerId) ||
        (linked.buyerId === sellerId && linked.sellerId === buyerId))
    ) {
      await ensureThreadParticipants(tx, linked.id, linked.buyerId, linked.sellerId);
      return { threadId: linked.id, created: false };
    }
  }

  const existingByAnchor = await tx.messageThread.findUnique({
    where: { buyerId_sellerId_anchorKey: { buyerId, sellerId, anchorKey } },
    select: { id: true },
  });

  const thread = await tx.messageThread.upsert({
    where: { buyerId_sellerId_anchorKey: { buyerId, sellerId, anchorKey } },
    create: {
      buyerId,
      sellerId,
      listingId: offer.targetListingId,
      anchorKey,
      conversationKind: "trade",
      inbox: "primary",
    },
    update: {
      conversationKind: "trade",
      inbox: "primary",
      listingId: offer.targetListingId,
    },
    select: { id: true },
  });

  await ensureThreadParticipants(tx, thread.id, buyerId, sellerId);

  if (offer.conversationId !== thread.id) {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: { conversationId: thread.id },
    });
  }

  const created = !existingByAnchor;
  if (created) {
    const partnerId = actorUserId === buyerId ? sellerId : buyerId;
    await appendSystemMessage(tx, {
      threadId: thread.id,
      senderId: actorUserId,
      recipientId: partnerId,
      listingId: offer.targetListingId,
      systemEvent: "trade_pending",
    });
  }

  return { threadId: thread.id, created };
}

export function offerStatusChip(offer: Pick<Offer, "status" | "amountUsd"> | null): string | null {
  if (!offer) return null;
  return `${offer.status} · $${offer.amountUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function orderStatusChip(order: Pick<Order, "status"> | null): string | null {
  if (!order) return null;
  return order.status.replace(/_/g, " ");
}
