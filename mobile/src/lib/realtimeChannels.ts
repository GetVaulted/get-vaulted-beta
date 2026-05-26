/** Supabase Realtime channel + event names (must match web server). */

export function roomChannel(liveRoomId: string): string {
  return `gv-room-${liveRoomId}`;
}

export const RT_EVENT = {
  chatMessage: 'chat_message',
  bidPlaced: 'bid_placed',
  auctionStarted: 'auction_started',
  auctionEnded: 'auction_ended',
  activeItemChanged: 'active_item_changed',
  purchaseCompleted: 'purchase_completed',
  messagesRefresh: 'messages_refresh',
  queueItems: 'queue_items',
  breakSpots: 'break_spots',
  listingBid: 'listing_bid',
  teamBoard: 'team_board',
  streamStatus: 'stream_status',
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
  winnerUsername?: string | null;
  winnerId?: string | null;
  winningAmountUsd?: number | null;
  noBids?: boolean;
};
