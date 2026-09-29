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
  sweet16DraftStarted: 'sweet16_draft_started',
  sweet16DraftPickMade: 'sweet16_draft_pick_made',
  sweet16DraftComplete: 'sweet16_draft_complete',
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
  /** Host Pause / background pause — buyers must refresh and show Host paused (not Retry). */
  streamPaused?: boolean;
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
  /** Sweet 16 draft events (see live-sweet16-draft.ts) — kept loose here, narrowed by callers. */
  turnOrder?: string[];
  currentTurnIndex?: number | null;
  currentTurnPurchaseId?: string | null;
  currentTurnDeadlineAt?: string | null;
  remainingTeamLabels?: string[];
  turnSeconds?: number;
  purchaseId?: string;
  teamLabel?: string;
  teamAbbr?: string;
  turnIndex?: number;
  autoAssigned?: boolean;
  nextTurnPurchaseId?: string | null;
  nextTurnDeadlineAt?: string | null;
  complete?: boolean;
};
