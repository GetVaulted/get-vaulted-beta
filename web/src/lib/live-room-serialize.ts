import type {
  BreakHit,
  BreakSpot,
  LiveItemSalesFormat,
  LiveItemVariant,
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
import { resolveLiveRoomItemQuantityState } from "@/lib/live-room-item-quantity-display";
import {
  serializeLiveItemVariants,
  type LiveItemVariantDTO,
} from "@/lib/live-item-variant-serialize";

export type { LiveItemVariantDTO };
import { serializeLiveTipConfig } from "@/lib/live-tip-routing";

/** Result of `liveRoom.findUnique` with seller, items, messages+sender, and optional break relations. */
export type LiveRoomDetailPayload = LiveRoom & {
  seller: Pick<User, "id" | "username">;
  tipModerator?: Pick<User, "id" | "username"> | null;
  items: (LiveRoomItem & { variants?: LiveRoomItemVariantRow[] })[];
  messages: (LiveRoomMessage & { sender: Pick<User, "username"> })[];
  breakSpots?: (BreakSpot & { user: Pick<User, "username"> })[];
  breakHits?: (BreakHit & { buyer: Pick<User, "username"> | null })[];
};

type LiveRoomItemVariantRow = LiveItemVariant & {
  purchases?: { buyer?: Pick<User, "username"> | null }[];
};

export type { LiveRoomBreakPublicDTO };

export type LiveRoomItemDTO = {
  id: string;
  liveRoomId: string;
  listingId: string | null;
  title: string;
  /** Remaining units on this queue row. */
  quantity: number;
  /** Original unit count when the row was created. */
  quantityInitial: number;
  soldQuantity: number;
  remainingQuantity: number;
  currentUnitNumber: number | null;
  displayTitle: string;
  progressLabel: string | null;
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
  salesFormat: LiveItemSalesFormat;
  variants: LiveItemVariantDTO[];
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
  tipRecipientMode: "host" | "moderator";
  tipModeratorId: string | null;
  tipModeratorUsername: string | null;
  tipsToModerator: boolean;
  /**
   * When `false`, the signed-in viewer (non-host) must add a saved card before live bids are accepted.
   * Omitted or `true` when Stripe is off, the viewer is the host, or the viewer is not signed in.
   */
  buyerLiveBidPaymentReady?: boolean;
  /**
   * When `false`, the signed-in viewer (non-host) must add a shipping address (Wallet) before live commerce.
   * Relaxed under the same conditions as `buyerLiveBidPaymentReady`.
   */
  buyerLiveShippingReady?: boolean;
};

export function serializeLiveRoomItem(
  row: LiveRoomItem & { variants?: LiveRoomItemVariantRow[] },
  options?: { unitsClaimed?: number | null },
): LiveRoomItemDTO {
  const qtyRaw = (row as { quantity?: unknown }).quantity;
  const quantity =
    typeof qtyRaw === "number" && Number.isFinite(qtyRaw)
      ? Math.min(512, Math.max(0, Math.floor(qtyRaw)))
      : 1;
  const qtyInitRaw = (row as { quantityInitial?: unknown }).quantityInitial;
  const quantityInitial =
    typeof qtyInitRaw === "number" && Number.isFinite(qtyInitRaw) && qtyInitRaw >= 1
      ? Math.min(512, Math.floor(qtyInitRaw))
      : Math.max(1, quantity);
  const qtyState = resolveLiveRoomItemQuantityState({
    title: row.title,
    quantity,
    quantityInitial,
    status: row.status,
    unitsClaimed: options?.unitsClaimed ?? null,
  });
  const ext = row as LiveRoomItem & {
    biddingOpen?: unknown;
    auctionEndsAt?: Date | null;
    clutchTimeEnabled?: unknown;
    salesFormat?: LiveItemSalesFormat;
    variants?: LiveRoomItemVariantRow[];
  };
  const biddingOpen = ext.biddingOpen === true;
  const auctionEndsAt =
    ext.auctionEndsAt instanceof Date && !Number.isNaN(ext.auctionEndsAt.getTime()) ? ext.auctionEndsAt.toISOString() : null;
  const clutchTimeEnabled = ext.clutchTimeEnabled === true;
  const lastHighBidderId =
    typeof row.lastHighBidderId === "string" && row.lastHighBidderId.trim() ? row.lastHighBidderId.trim() : null;
  const salesFormat = ext.salesFormat ?? "auction";
  const variants = serializeLiveItemVariants(ext.variants);
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    listingId: row.listingId,
    title: row.title,
    quantity,
    quantityInitial: qtyState.totalQuantity,
    soldQuantity: qtyState.soldQuantity,
    remainingQuantity: qtyState.remainingQuantity,
    currentUnitNumber: qtyState.currentUnitNumber,
    displayTitle: qtyState.displayTitle,
    progressLabel: qtyState.progressLabel,
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
    salesFormat,
    variants,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLiveRoomMessage(
  row: LiveRoomMessage & { sender?: Pick<User, "username"> | null; deletedAt?: Date | null },
): LiveRoomMessageDTO {
  const deleted = row.deletedAt != null;
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    senderId: row.senderId,
    senderUsername: row.sender?.username?.trim() || "System",
    body: deleted ? "[message removed]" : row.body,
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
    items: items.map((item) => serializeLiveRoomItem(item)),
    messages,
    activeItem: active ? serializeLiveRoomItem(active) : null,
    break: breakSnapshot,
    teamBoardLeague: room.teamBoardLeague,
    ...serializeLiveTipConfig({
      tipRecipientMode: room.tipRecipientMode,
      tipModeratorId: room.tipModeratorId,
      tipModerator: room.tipModerator ?? null,
    }),
  };
}
