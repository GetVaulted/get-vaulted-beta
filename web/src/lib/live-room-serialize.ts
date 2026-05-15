import type {
  BreakHit,
  BreakSpot,
  LiveRoom,
  LiveRoomItem,
  LiveRoomMessage,
  LiveRoomItemStatus,
  LiveRoomMessageType,
  LiveRoomStatus,
  LiveRoomType,
  TeamBoardLeague,
  User,
} from "@/generated/prisma/client";
import { buildBreakPublicSnapshot, type LiveRoomBreakPublicDTO } from "@/lib/live-room-break-public";

/** Result of `liveRoom.findUnique` with seller, items, messages+sender, and optional break relations. */
export type LiveRoomDetailPayload = LiveRoom & {
  seller: Pick<User, "id" | "username">;
  items: LiveRoomItem[];
  messages: (LiveRoomMessage & { sender: Pick<User, "username"> })[];
  breakSpots?: (BreakSpot & { user: Pick<User, "username"> })[];
  breakHits?: (BreakHit & { buyer: Pick<User, "username"> | null })[];
};

export type { LiveRoomBreakPublicDTO };

export type LiveRoomItemDTO = {
  id: string;
  liveRoomId: string;
  listingId: string | null;
  title: string;
  quantity: number;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  /** Current auction leader for live-room bids (persisted on `LiveRoomItem`). */
  lastHighBidderId: string | null;
  /** Resolved from `lastHighBidderId` when API enriches items (optional on pure serialize). */
  lastHighBidderUsername: string | null;
  status: LiveRoomItemStatus;
  sortOrder: number;
  teamBoardMisc: boolean;
  itemVersion: number;
  /** Host opens bidding with Start; false while lot is only posted on screen. */
  biddingOpen: boolean;
  /** ISO end of timed bidding window; null before host starts or after clear. */
  auctionEndsAt: string | null;
  /** True = sudden death (no timer extension on bids). */
  clutchTimeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LiveRoomMessageDTO = {
  id: string;
  liveRoomId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  messageType: LiveRoomMessageType;
  createdAt: string;
};

export type LiveRoomDetailDTO = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  title: string;
  description: string;
  category: string;
  roomType: LiveRoomType;
  status: LiveRoomStatus;
  thumbnailUrl: string;
  viewerCount: number;
  roomVersion: number;
  /** Monotonic canonical auction event sequence for this room (bid stream ordering). */
  auctionEventSeq: number;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: LiveRoomItemDTO[];
  messages: LiveRoomMessageDTO[];
  activeItem: LiveRoomItemDTO | null;
  /** Present for `roomType === "break"` — read-only buyer snapshot. */
  break: LiveRoomBreakPublicDTO | null;
  /** PYT team board league (break rooms). */
  teamBoardLeague: TeamBoardLeague;
  /**
   * When `false`, the signed-in viewer (non-host) must add a saved card before live bids are accepted.
   * Omitted or `true` when Stripe is off, the viewer is the host, or the viewer is not signed in.
   */
  buyerLiveBidPaymentReady?: boolean;
};

export function serializeLiveRoomItem(row: LiveRoomItem): LiveRoomItemDTO {
  const qtyRaw = (row as { quantity?: unknown }).quantity;
  const quantity =
    typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
  const ext = row as LiveRoomItem & { biddingOpen?: unknown; auctionEndsAt?: Date | null; clutchTimeEnabled?: unknown };
  const biddingOpen = ext.biddingOpen === true;
  const auctionEndsAt =
    ext.auctionEndsAt instanceof Date && !Number.isNaN(ext.auctionEndsAt.getTime()) ? ext.auctionEndsAt.toISOString() : null;
  const clutchTimeEnabled = ext.clutchTimeEnabled === true;
  const lastHighBidderId =
    typeof row.lastHighBidderId === "string" && row.lastHighBidderId.trim() ? row.lastHighBidderId.trim() : null;
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    listingId: row.listingId,
    title: row.title,
    quantity,
    imageUrl: row.imageUrl,
    priceUsd: row.priceUsd,
    startingBidUsd: row.startingBidUsd,
    currentBidUsd: row.currentBidUsd,
    lastHighBidderId,
    lastHighBidderUsername: null,
    status: row.status,
    sortOrder: row.sortOrder,
    teamBoardMisc: row.teamBoardMisc,
    itemVersion: row.itemVersion,
    biddingOpen,
    auctionEndsAt,
    clutchTimeEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLiveRoomMessage(row: LiveRoomMessage & { sender: Pick<User, "username"> }): LiveRoomMessageDTO {
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    senderId: row.senderId,
    senderUsername: row.sender.username,
    body: row.body,
    messageType: row.messageType,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildLiveRoomDetail(room: LiveRoomDetailPayload): LiveRoomDetailDTO {
  const items = [...room.items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  const active = items.find((i) => i.status === "active") ?? null;
  const messages = [...room.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(serializeLiveRoomMessage);

  const breakSnapshot =
    room.roomType === "break"
      ? buildBreakPublicSnapshot(room, items, room.breakSpots ?? [], room.breakHits ?? [])
      : null;

  return {
    id: room.id,
    sellerId: room.sellerId,
    sellerUsername: room.seller.username,
    title: room.title,
    description: room.description,
    category: room.category,
    roomType: room.roomType,
    status: room.status,
    thumbnailUrl: room.thumbnailUrl,
    viewerCount: room.viewerCount,
    roomVersion: room.roomVersion,
    auctionEventSeq: room.auctionEventSeq ?? 0,
    scheduledStartAt: room.scheduledStartAt?.toISOString() ?? null,
    startedAt: room.startedAt?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    items: items.map(serializeLiveRoomItem),
    messages,
    activeItem: active ? serializeLiveRoomItem(active) : null,
    break: breakSnapshot,
    teamBoardLeague: room.teamBoardLeague,
  };
}
