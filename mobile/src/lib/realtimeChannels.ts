/** Supabase Realtime channel + event names (must match web server). */

export function roomChannel(liveRoomId: string): string {
  return `gv-room-${liveRoomId}`;
}

export const RT_EVENT = {
  chatMessage: 'chat_message',
  /** Host/mod staff chat — only subscribe when canModerate. */
  staffChatMessage: 'staff_chat_message',
  /** Host-observed concurrent viewers — one room-wide number for all clients. */
  viewerCount: 'viewer_count',
  bidPlaced: 'bid_placed',
  auctionStarted: 'auction_started',
  auctionEnded: 'auction_ended',
  activeItemChanged: 'active_item_changed',
  purchaseCompleted: 'purchase_completed',
  paymentFailed: 'payment_failed',
  paymentRecovered: 'payment_recovered',
  messagesRefresh: 'messages_refresh',
  queueItems: 'queue_items',
  variantPurchased: 'variant_purchased',
  teamBreakReady: 'team_break_ready',
  teamBreakBegan: 'team_break_began',
  breakSpots: 'break_spots',
  listingBid: 'listing_bid',
  teamBoard: 'team_board',
  streamStatus: 'stream_status',
  moderationChanged: 'moderation_changed',
  giveawaysChanged: 'giveaways_changed',
  vaultRevealSpin: 'vault_reveal_spin',
} as const;

export const RT_EVENT_ALIASES = {
  chatMessage: ['live_room_message'],
  streamStatus: [] as string[],
} as const;

export type RoomBroadcastPayload = {
  liveRoomId?: string;
  roomId?: string;
  itemId?: string;
  amountUsd?: number;
  bidderId?: string;
  leadingBidderId?: string;
  leadingBidderUsername?: string | null;
  listingId?: string | null;
  roomVersion?: number;
  itemVersion?: number;
  auctionSeq?: number;
  auctionEndsAt?: string | null;
  biddingOpen?: boolean;
  serverNowMs?: number;
  eventId?: string;
  emittedAt?: string;
  streamHealth?: string;
  streamMode?: string;
  winnerUsername?: string | null;
  winnerId?: string | null;
  winningAmountUsd?: number | null;
  noBids?: boolean;
  itemSoldOut?: boolean;
  paymentStatus?: string | null;
  buyerId?: string;
  failureId?: string;
  buyerUsername?: string | null;
  itemTitle?: string | null;
  failureReason?: string | null;
  randomReveal?: boolean;
};
