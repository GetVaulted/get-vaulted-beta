/**
 * Prisma application tables on beta Postgres (excludes _prisma_migrations).
 * Used for full-wipe TRUNCATE and dry-run row counts.
 *
 * BETA_PRESERVE_TABLES are system/config metadata — never truncated by reset scripts.
 */
export const BETA_PRESERVE_TABLES = ["TaxNexusState"] as const;

export type BetaPreserveTable = (typeof BETA_PRESERVE_TABLES)[number];

/** All user/app data tables — cleared on fresh-start reset. */
export const BETA_APP_TABLES = [
  "LiveBidIdempotency",
  "WebhookEventLog",
  "LiveShippingSessionItem",
  "LiveAuctionInventoryHold",
  "LiveAuctionProxyBid",
  "LiveAuctionEvent",
  "LiveRoomBid",
  "LiveItemVariantPurchase",
  "LiveItemVariant",
  "LiveRoomPaymentFailure",
  "LiveTip",
  "LiveRoomTeamBoardPick",
  "LiveRoomTeamBoard",
  "LiveRoomMessage",
  "LiveRoomModerationAction",
  "LiveRoomModerator",
  "LiveStreamReplay",
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
  "ReportAuditLog",
  "Report",
  "DisputeEvidenceBundle",
  "TrustModerationAuditLog",
  "PayoutEligibilityAuditLog",
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
  table: BetaAppTable | BetaPreserveTable;
  delegate: string;
  preserve?: boolean;
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
  { table: "LiveItemVariant", delegate: "liveItemVariant" },
  { table: "LiveItemVariantPurchase", delegate: "liveItemVariantPurchase" },
  { table: "LiveRoomBid", delegate: "liveRoomBid" },
  { table: "LiveRoomPaymentFailure", delegate: "liveRoomPaymentFailure" },
  { table: "LiveTip", delegate: "liveTip" },
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
  { table: "LiveStreamReplay", delegate: "liveStreamReplay" },
  { table: "LiveRoomModerator", delegate: "liveRoomModerator" },
  { table: "LiveRoomModerationAction", delegate: "liveRoomModerationAction" },
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
  { table: "Report", delegate: "report" },
  { table: "ReportAuditLog", delegate: "reportAuditLog" },
  { table: "DisputeEvidenceBundle", delegate: "disputeEvidenceBundle" },
  { table: "TrustModerationAuditLog", delegate: "trustModerationAuditLog" },
  { table: "PayoutEligibilityAuditLog", delegate: "payoutEligibilityAuditLog" },
  { table: "WebhookEventLog", delegate: "webhookEventLog" },
  { table: "TaxNexusState", delegate: "taxNexusState", preserve: true },
];
