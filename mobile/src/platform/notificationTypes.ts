export type NotificationKind =
  | 'follow'
  | 'live_event'
  | 'offer'
  | 'counter'
  | 'review'
  | 'support'
  | 'dispute'
  | 'trade'
  | 'order'
  | 'layaway'
  | 'message';

export type AppNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  /** Original server notification type (for routing). */
  serverType?: string;
  /** Original server href (for routing). */
  href?: string;
  read: boolean;
  createdAt: string;
};
