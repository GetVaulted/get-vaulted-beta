export type MessageConversationKind =
  | 'buyer_seller'
  | 'offer_negotiation'
  | 'order_support'
  | 'trade'
  | 'live_networking'
  | 'system';

export type MessageThreadInbox = 'primary' | 'request';

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
};

export type ThreadMessage = {
  id: string;
  senderId: string;
  body: string;
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
