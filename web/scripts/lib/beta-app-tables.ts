/**
 * All Prisma application tables on beta Postgres (excludes _prisma_migrations).
 * Used for full-wipe TRUNCATE and dry-run row counts.
 */
export const BETA_APP_TABLES = [
  "LiveBidIdempotency",
  "WebhookEventLog",
  "LiveShippingSessionItem",
  "LiveAuctionInventoryHold",
  "LiveAuctionProxyBid",
  "LiveAuctionEvent",
  "LiveRoomTeamBoardPick",
  "LiveRoomTeamBoard",
  "LiveRoomMessage",
  "BreakHit",
  "HitClip",
  "BreakSpot",
  "LiveRoomItem",
  "LiveShippingSession",
  "Message",
  "MessageThreadParticipant",
  "MessageThread",
  "TradeOfferEvent",
  "TradeOfferItem",
  "TradeOffer",
  "ListingEndAuditLog",
  "ListingEndRequest",
  "WatchlistItem",
  "Offer",
  "Bid",
  "Order",
  "ListingImage",
  "LiveRoom",
  "Listing",
  "SellerCommerceEvent",
  "SellerFollow",
  "Notification",
  "EmailVerificationCode",
  "Address",
  "User",
] as const;

export type BetaAppTable = (typeof BETA_APP_TABLES)[number];

export function betaTruncateSql(): string {
  const tables = BETA_APP_TABLES.map((t) => `"${t}"`).join(",\n  ");
  return `TRUNCATE TABLE\n  ${tables}\nRESTART IDENTITY CASCADE;`;
}

/** Prisma model delegate keys for row counts (matches schema model names). */
export const BETA_APP_COUNT_DELEGATES: ReadonlyArray<{
  table: BetaAppTable;
  delegate: string;
}> = [
  { table: "User", delegate: "user" },
  { table: "Address", delegate: "address" },
  { table: "EmailVerificationCode", delegate: "emailVerificationCode" },
  { table: "Listing", delegate: "listing" },
  { table: "ListingImage", delegate: "listingImage" },
  { table: "ListingEndRequest", delegate: "listingEndRequest" },
  { table: "ListingEndAuditLog", delegate: "listingEndAuditLog" },
  { table: "Bid", delegate: "bid" },
  { table: "Offer", delegate: "offer" },
  { table: "Order", delegate: "order" },
  { table: "LiveRoom", delegate: "liveRoom" },
  { table: "LiveRoomItem", delegate: "liveRoomItem" },
  { table: "LiveRoomMessage", delegate: "liveRoomMessage" },
  { table: "LiveAuctionEvent", delegate: "liveAuctionEvent" },
  { table: "LiveBidIdempotency", delegate: "liveBidIdempotency" },
  { table: "LiveAuctionInventoryHold", delegate: "liveAuctionInventoryHold" },
  { table: "LiveAuctionProxyBid", delegate: "liveAuctionProxyBid" },
  { table: "LiveRoomTeamBoard", delegate: "liveRoomTeamBoard" },
  { table: "LiveRoomTeamBoardPick", delegate: "liveRoomTeamBoardPick" },
  { table: "BreakSpot", delegate: "breakSpot" },
  { table: "BreakHit", delegate: "breakHit" },
  { table: "HitClip", delegate: "hitClip" },
  { table: "LiveShippingSession", delegate: "liveShippingSession" },
  { table: "LiveShippingSessionItem", delegate: "liveShippingSessionItem" },
  { table: "TradeOffer", delegate: "tradeOffer" },
  { table: "TradeOfferItem", delegate: "tradeOfferItem" },
  { table: "TradeOfferEvent", delegate: "tradeOfferEvent" },
  { table: "MessageThread", delegate: "messageThread" },
  { table: "MessageThreadParticipant", delegate: "messageThreadParticipant" },
  { table: "Message", delegate: "message" },
  { table: "Notification", delegate: "notification" },
  { table: "SellerFollow", delegate: "sellerFollow" },
  { table: "SellerCommerceEvent", delegate: "sellerCommerceEvent" },
  { table: "WatchlistItem", delegate: "watchlistItem" },
  { table: "WebhookEventLog", delegate: "webhookEventLog" },
];
