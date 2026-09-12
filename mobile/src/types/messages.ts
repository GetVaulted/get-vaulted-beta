export type MessageConversationKind =
  | 'buyer_seller'
  | 'offer_negotiation'
  | 'order_support'
  | 'trade'
  | 'live_networking'
  | 'system';

export type MessageThreadInbox = 'primary' | 'request';

/** Client-side view selector — 'trash' isn't a real `inbox` column value, it's a query over deleted-for-me threads. */
export type MessageThreadView = MessageThreadInbox | 'trash';

export type MessageKind = 'user' | 'system';

export type ThreadListItem = {
  id: string;
  inbox: MessageThreadInbox;
  conversationKind: MessageConversationKind;
  conversationLabel: string;
  listingId: string;
  listingTitle: string;
  contextHeadline: string;
  contextSubline?: string;
  thumbnailUrl: string | null;
  offerId: string | null;
  orderId: string | null;
  liveRoomId: string | null;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  lastPreview: string;
  lastAt: string;
  lastKind: MessageKind;
  unreadCount: number;
  pinned: boolean;
  starred: boolean;
  muted: boolean;
  offerStatus: string | null;
  orderStatus: string | null;
  isSeller: boolean;
  /** Set once this conversation has been deleted (for this user only) and is sitting in Trash. */
  deletedAt: string | null;
  /** When the 14-day trash window expires and this thread is purged for good. */
  purgeAt: string | null;
};

export type ThreadMessage = {
  id: string;
  senderId: string;
  body: string;
  imageUrl?: string | null;
  kind: MessageKind;
  systemEvent: string | null;
  readAt: string | null;
  createdAt: string;
  mentions?: { userId: string; username: string }[];
};

export type ThreadDetail = {
  id: string;
  inbox: MessageThreadInbox;
  conversationKind: MessageConversationKind;
  conversationLabel: string;
  listingId: string;
  listingTitle: string;
  contextHeadline: string;
  contextSubline?: string;
  thumbnailUrl: string | null;
  offerId: string | null;
  orderId: string | null;
  liveRoomId: string | null;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  isSeller: boolean;
  pinned: boolean;
  starred: boolean;
  muted: boolean;
  offerStatus: string | null;
  orderStatus: string | null;
};
