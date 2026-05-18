/**
 * Private vault communication layer — thread types are intentionally separate
 * from generic DMs. Each lane has its own policy, retention, and moderation hooks.
 */

export type VaultThreadKind =
  | 'trade_negotiation'
  | 'support'
  | 'order'
  | 'seller_inquiry'
  | 'dispute';

export type VaultThreadStatus = 'open' | 'locked' | 'archived';

export type VaultThread = {
  id: string;
  kind: VaultThreadKind;
  participantIds: string[];
  referenceType?: 'trade' | 'order' | 'listing' | 'live_room' | 'support_ticket' | 'dispute';
  referenceId?: string;
  status: VaultThreadStatus;
  lastMessageAt: string;
  createdAt: string;
};

export type VaultMessage = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  system?: boolean;
};

/** Maps existing MessageThread flows to vault kinds during migration. */
export function inferThreadKindFromLegacy(opts: {
  listingId?: string;
  liveRoomId?: string;
  tradeId?: string;
}): VaultThreadKind {
  if (opts.tradeId) return 'trade_negotiation';
  if (opts.liveRoomId) return 'seller_inquiry';
  if (opts.listingId) return 'seller_inquiry';
  return 'seller_inquiry';
}
