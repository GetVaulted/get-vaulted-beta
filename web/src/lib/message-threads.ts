import type {
  MessageConversationKind,
  MessageThread,
  MessageThreadInbox,
  Offer,
  Order,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
  tx: Prisma.TransactionClient,
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

/** Unknown buyers land in requests until seller accepts or prior commerce exists. */
export async function resolveInboxForNewThread(
  buyerId: string,
  sellerId: string,
): Promise<MessageThreadInbox> {
  const [priorThread, priorOrder, priorOffer] = await Promise.all([
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

  if (priorThread > 0 || priorOrder > 0 || priorOffer > 0) {
    return "primary";
  }
  return "request";
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
