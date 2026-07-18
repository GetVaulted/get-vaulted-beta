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

export type ThreadContextLabel = {
  headline: string;
  subline?: string;
  thumbnailUrl?: string;
  listingId?: string;
  offerId?: string;
  orderId?: string;
  liveRoomId?: string;
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
  thread: Pick<MessageThread, "listingId" | "offerId" | "orderId" | "liveRoomId" | "conversationKind">,
): Promise<ThreadContextLabel> {
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
      return "Trade offer pending — review details in Trade Center.";
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

export function offerStatusChip(offer: Pick<Offer, "status" | "amountUsd"> | null): string | null {
  if (!offer) return null;
  return `${offer.status} · $${offer.amountUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function orderStatusChip(order: Pick<Order, "status"> | null): string | null {
  if (!order) return null;
  return order.status.replace(/_/g, " ");
}
