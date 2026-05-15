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

export const RT_EVENT = {
  chatMessage: "chat_message",
  viewerJoined: "viewer_joined",
  viewerLeft: "viewer_left",
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
  breakSpots: "break_spots",
  listingBid: "listing_bid",
  notification: "notification",
  teamBoard: "team_board",
  /** IVS / server stream health changed — clients refetch GET /api/live-rooms/[id]/stream (buyer-safe). */
  streamStatus: "stream_status",
} as const;

/**
 * Backward-compatible aliases while we migrate emitters/listeners to the canonical contract.
 * Keep until all old event producers/consumers are removed.
 * Audited: only `chatMessage` duplicates (`live_room_message`); other events emit once per logical action.
 */
export const RT_EVENT_ALIASES = {
  chatMessage: ["live_room_message"],
  viewerJoined: [],
  viewerLeft: [],
  bidPlaced: [],
  auctionStarted: [],
  auctionEnded: [],
  activeItemChanged: [],
  purchaseCompleted: [],
  queueItems: [],
  streamStatus: [],
} as const;
