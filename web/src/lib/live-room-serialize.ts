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
import { isVariantSalesFormat, summarizeVariantSpots } from "@/lib/live-item-variant-presets";
import {
  serializeLiveItemVariants,
  type LiveItemVariantDTO,
} from "@/lib/live-item-variant-serialize";

export type { LiveItemVariantDTO };
import { serializeLiveTipConfig } from "@/lib/live-tip-routing";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import type {
  LivePinnedShippingTaxDTO,
  LiveVariantCheckoutPreviewForRoom,
} from "@/lib/live-variant-checkout-preview-for-room";

/** Result of `liveRoom.findUnique` with seller, items, messages+sender, and optional break relations. */
export type LiveRoomDetailPayload = LiveRoom & {
  seller: Pick<User, "id" | "username">;
  tipModerator?: Pick<User, "id" | "username"> | null;
  items: (LiveRoomItem & { variants?: LiveRoomItemVariantRow[] })[];
  messages: (LiveRoomMessage & { sender: Pick<User, "username" | "image"> })[];
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
  bidIncrementUsd: number | null;
  reservePriceUsd: number | null;
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
  variantAssignmentMode: "pick" | "random";
  variants: LiveItemVariantDTO[];
  /** Paid random-reveal assignments (team/division label → buyer). */
  randomSpotClaims?: { label: string; buyerUsername: string }[];
  /** ISO when all variant spots sold (team break ready). */
  variantBreakReadyAt: string | null;
  /** ISO when host began the break. */
  variantBreakBeganAt: string | null;
  /** PYT/PYD default spot commerce (`hybrid` = fixed or auction per pin). */
  variantSpotCommerceDefault: "fixed" | "auction" | "hybrid";
  /** Runtime mode for the pinned spot (`null` when idle). */
  activeSpotCommerceMode: "fixed" | "auction" | null;
  /** Variant id when timed bidding is scoped to one PYT/PYD spot. */
  auctionVariantId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveRoomMessageDTO = {
  id: string;
  liveRoomId: string;
  senderId: string;
  senderUsername: string;
  /** Profile photo URL when the sender has one set. */
  senderAvatarUrl: string | null;
  body: string;
  messageType: LiveRoomMessageType;
  createdAt: string;
  mentions: { userId: string; username: string }[];
};

export type LiveRoomDetailDTO = {
  id: string;
  sellerId: string;
  sellerUsername: string;
  title: string;
  description: string;
  /** In-room show notes for people who enter (not discovery). */
  showNotes: string;
  category: string;
  roomType: LiveRoomType;
  status: LiveRoomStatus;
  thumbnailUrl: string;
  /** Short looping promo for scheduled rooms; null when unset. */
  teaserVideoUrl: string | null;
  teaserVideoDurationMs: number | null;
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
  /** Unified live buyer payment session (saved card pipeline). */
  buyerLivePayment?: LiveBuyerPaymentSessionDTO;
  /** Active unresolved payment failure — buyer must recover before bidding/buying in this room. */
  buyerUnresolvedPaymentFailure?: LiveBuyerPaymentFailureDTO | null;
  /** Host-only: buyers with failed payments in this room. */
  sellerUnresolvedPaymentFailures?: SellerPaymentFailureDTO[];
  /** Open giveaways accepting entries (buyer watch UI). */
  giveaways?: ViewerGiveawayDTO[];
  /** PYT/PYD checkout totals for the active item when buyer wallet is ready. */
  variantCheckoutPreview?: LiveVariantCheckoutPreviewForRoom | null;
  /** Shipping + tax for the active auction / buy-now pinned lot (pinned-box line). */
  activeItemShippingTax?: LivePinnedShippingTaxDTO | null;
};

export type LiveBuyerPaymentFailureDTO = {
  id: string;
  kind: string;
  liveRoomItemId: string | null;
  orderId: string | null;
  variantPurchaseId: string | null;
  breakSpotId: string | null;
  amountUsd: number;
  status: "payment_failed" | "recovery_pending";
  failureReason: string | null;
  failedAt: string;
  itemTitle: string | null;
  buyerUsername: string | null;
};

export type SellerPaymentFailureDTO = LiveBuyerPaymentFailureDTO & {
  buyerId: string;
};

export type LiveBuyerPaymentSessionDTO = {
  liveRoomPaymentReady: boolean;
  paymentReady: boolean;
  shippingReady: boolean;
  activePaymentMethodId: string | null;
  preauthorizationStatus: "none" | "wallet_ready" | "authorized";
  paymentFailureState: { code: string; message: string } | null;
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
  const salesFormat = (row as { salesFormat?: LiveItemSalesFormat }).salesFormat ?? "auction";
  // PYT/PYD progress comes from variant soldCount — not BreakSpot claims (often 0 for variant lots).
  const variantUnitsClaimed =
    isVariantSalesFormat(salesFormat) && Array.isArray(row.variants) && row.variants.length > 0
      ? summarizeVariantSpots(
          row.variants.map((v) => ({
            soldCount: v.soldCount,
            quantityRemaining: v.quantityRemaining,
            status: v.status,
            priceUsd: v.priceUsd,
          })),
        ).sold
      : null;
  const unitsClaimed =
    variantUnitsClaimed != null ? variantUnitsClaimed : (options?.unitsClaimed ?? null);
  const qtyState = resolveLiveRoomItemQuantityState({
    title: row.title,
    quantity,
    quantityInitial,
    status: row.status,
    unitsClaimed,
  });
  const ext = row as LiveRoomItem & {
    biddingOpen?: unknown;
    auctionEndsAt?: Date | null;
    clutchTimeEnabled?: unknown;
    salesFormat?: LiveItemSalesFormat;
    variantAssignmentMode?: "pick" | "random";
    variants?: LiveRoomItemVariantRow[];
    variantBreakReadyAt?: Date | null;
    variantBreakBeganAt?: Date | null;
    variantSpotCommerceDefault?: "fixed" | "auction" | "hybrid";
    activeSpotCommerceMode?: "fixed" | "auction" | null;
    auctionVariantId?: string | null;
  };
  const biddingOpen = ext.biddingOpen === true;
  const auctionEndsAt =
    ext.auctionEndsAt instanceof Date && !Number.isNaN(ext.auctionEndsAt.getTime()) ? ext.auctionEndsAt.toISOString() : null;
  const clutchTimeEnabled = ext.clutchTimeEnabled === true;
  const lastHighBidderId =
    typeof row.lastHighBidderId === "string" && row.lastHighBidderId.trim() ? row.lastHighBidderId.trim() : null;
  const variantAssignmentMode = ext.variantAssignmentMode === "random" ? "random" : "pick";
  const variants = serializeLiveItemVariants(ext.variants);
  const variantBreakReadyAt =
    ext.variantBreakReadyAt instanceof Date && !Number.isNaN(ext.variantBreakReadyAt.getTime())
      ? ext.variantBreakReadyAt.toISOString()
      : null;
  const variantBreakBeganAt =
    ext.variantBreakBeganAt instanceof Date && !Number.isNaN(ext.variantBreakBeganAt.getTime())
      ? ext.variantBreakBeganAt.toISOString()
      : null;
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
    bidIncrementUsd: row.bidIncrementUsd,
    reservePriceUsd: row.reservePriceUsd,
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
    variantAssignmentMode,
    variants,
    variantBreakReadyAt,
    variantBreakBeganAt,
    variantSpotCommerceDefault: ext.variantSpotCommerceDefault ?? "hybrid",
    activeSpotCommerceMode: ext.activeSpotCommerceMode ?? null,
    auctionVariantId: typeof ext.auctionVariantId === "string" ? ext.auctionVariantId.trim() || null : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLiveRoomMessage(
  row: LiveRoomMessage & { sender?: Pick<User, "username" | "image"> | null; deletedAt?: Date | null },
  mentions: { userId: string; username: string }[] = [],
): LiveRoomMessageDTO {
  const deleted = row.deletedAt != null;
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    senderId: row.senderId,
    senderUsername: row.sender?.username?.trim() || "System",
    senderAvatarUrl: row.sender?.image?.trim() || null,
    body: deleted ? "[message removed]" : row.body,
    messageType: row.messageType,
    createdAt: row.createdAt.toISOString(),
    mentions: deleted ? [] : mentions,
  };
}

export function buildLiveRoomDetail(room: LiveRoomDetailPayload): LiveRoomDetailDTO {
  const items = [...room.items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  const active = items.find((i) => i.status === "active") ?? null;
  const messages = [...room.messages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => serializeLiveRoomMessage(m));

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
    showNotes: room.showNotes ?? "",
    category: room.category,
    roomType: room.roomType,
    status: room.status,
    thumbnailUrl: room.thumbnailUrl,
    teaserVideoUrl: room.teaserVideoUrl?.trim() || null,
    teaserVideoDurationMs:
      typeof room.teaserVideoDurationMs === "number" && Number.isFinite(room.teaserVideoDurationMs)
        ? Math.round(room.teaserVideoDurationMs)
        : null,
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
