/**
 * Canonical `LiveAuctionEvent.payload` for `eventType === "bid_placed"`.
 *
 * **Kafka / Redis migration:** partition key = `liveRoomId` (per-room total order).
 * `seq` is stored on the row, not duplicated inside payload, but flush copies it onto realtime `auctionSeq`.
 */
export const LIVE_AUCTION_EVENT_PAYLOAD_VERSION = 1 as const;

export type LiveAuctionBidPlacedPayloadV1 = {
  v: typeof LIVE_AUCTION_EVENT_PAYLOAD_VERSION;
  liveRoomId: string;
  itemId: string;
  amountUsd: number;
  bidderId: string;
  listingId: string | null;
  roomVersion: number;
  itemVersion: number | null;
  auctionEndsAt: string | null;
  biddingOpen: boolean;
  leadingBidderId: string;
  leadingBidderUsername: string | null;
  clutchTimeEnabled: boolean;
  /** When true, fan-out also emits `active_item_changed` after `bid_placed`. */
  emitActiveItemChanged: boolean;
};

export function isBidPlacedPayloadV1(x: unknown): x is LiveAuctionBidPlacedPayloadV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === LIVE_AUCTION_EVENT_PAYLOAD_VERSION &&
    typeof o.liveRoomId === "string" &&
    typeof o.itemId === "string" &&
    typeof o.amountUsd === "number" &&
    typeof o.bidderId === "string" &&
    (o.listingId === null || typeof o.listingId === "string") &&
    typeof o.roomVersion === "number" &&
    (o.itemVersion === null || typeof o.itemVersion === "number") &&
    (o.auctionEndsAt === null || typeof o.auctionEndsAt === "string") &&
    typeof o.biddingOpen === "boolean" &&
    typeof o.leadingBidderId === "string" &&
    (o.leadingBidderUsername === null || typeof o.leadingBidderUsername === "string") &&
    typeof o.clutchTimeEnabled === "boolean" &&
    typeof o.emitActiveItemChanged === "boolean"
  );
}
