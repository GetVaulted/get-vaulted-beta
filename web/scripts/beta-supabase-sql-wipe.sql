-- ONE-SHOT beta catalog wipe for Supabase SQL editor (project xkaaicokjgmpbctfermj ONLY).
-- Run only when CONFIRMED you are on beta — never production.
-- After this, run: CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full
-- (with web/.env.local DATABASE_URL pointing at the same project) to re-seed sellerqa/buyerqa.

TRUNCATE TABLE
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
  "User"
RESTART IDENTITY CASCADE;
