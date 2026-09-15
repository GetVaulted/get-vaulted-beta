/** Supabase Realtime channel + event names (broadcast). Server + client must match. */

export function roomChannel(liveRoomId: string): string {
  return `gv-room-${liveRoomId}`;
}

export function listingBidsChannel(listingId: string): string {
  return `gv-listing-bids-${listingId}`;
}

export function userNotificationsChannel(userId: string): string {
  return `gv-user-${userId}`;
}

/** Per-user vault ecosystem bus (layaways, orders, listings, offers, trades). */
export function vaultEcosystemChannel(userId: string): string {
  return `gv-ecosystem-${userId}`;
}

export const RT_EVENT = {
  chatMessage: "chat_message",
  /** Host/mod staff chat — clients must only handle when `canModerate`. */
  staffChatMessage: "staff_chat_message",
  viewerJoined: "viewer_joined",
  viewerLeft: "viewer_left",
  /** Host-observed concurrent viewers — one room-wide number for all clients. */
  viewerCount: "viewer_count",
  bidPlaced: "bid_placed",
  auctionStarted: "auction_started",
  auctionEnded: "auction_ended",
  activeItemChanged: "active_item_changed",
  purchaseCompleted: "purchase_completed",
  /**
   * Internal sync events kept for gradual migration.
   * - `messages_refresh`: server asks clients to merge message list from API (fallback sync)
   * - `break_spots`: break claim/pick state changed; clients refetch break-specific projections
   * - `listing_bid`: listing-level bid changed; clients refresh listing bid meta
   */
  messagesRefresh: "messages_refresh",
  /** Queue rows created/updated/deleted — clients refetch room detail / host console. */
  queueItems: "queue_items",
  /** Variant option purchased — spot board + queue cards refresh. */
  variantPurchased: "variant_purchased",
  /** All variant spots sold — team break ready for host to begin. */
  teamBreakReady: "team_break_ready",
  /** Host began variant team break — all viewers update. */
  teamBreakBegan: "team_break_began",
  /** Buyer payment failed in-room — show lockout modal / seller alert. */
  paymentFailed: "payment_failed",
  /** Buyer recovered failed payment — lift room restrictions. */
  paymentRecovered: "payment_recovered",
  breakSpots: "break_spots",
  listingBid: "listing_bid",
  notification: "notification",
  /** Layaways, orders, listings, offers — one envelope per user channel. */
  vaultEcosystem: "vault_ecosystem",
  teamBoard: "team_board",
  /** IVS / server stream health changed — clients refetch GET /api/live-rooms/[id]/stream (buyer-safe). */
  streamStatus: "stream_status",
  /** Moderator roster changed — clients refetch GET /api/live-rooms/[id]/moderation. */
  moderationChanged: "moderation_changed",
  /** Giveaway rows created/updated — clients refetch host console giveaways. */
  giveawaysChanged: "giveaways_changed",
  /** Synchronized Vault Reveal wheel (giveaway draw + PYT randomizer). */
  vaultRevealSpin: "vault_reveal_spin",
} as const;

/**
 * Backward-compatible aliases while we migrate emitters/listeners to the canonical contract.
 * Keep until all old event producers/consumers are removed.
 * Audited: only `chatMessage` duplicates (`live_room_message`); other events emit once per logical action.
 */
export const RT_EVENT_ALIASES = {
  chatMessage: ["live_room_message"],
  staffChatMessage: [],
  viewerJoined: [],
  viewerLeft: [],
  bidPlaced: [],
  auctionStarted: [],
  auctionEnded: [],
  activeItemChanged: [],
  purchaseCompleted: [],
  queueItems: [],
  variantPurchased: [],
  teamBreakReady: [],
  teamBreakBegan: [],
  paymentFailed: [],
  paymentRecovered: [],
  streamStatus: [],
  moderationChanged: [],
  giveawaysChanged: [],
} as const;
