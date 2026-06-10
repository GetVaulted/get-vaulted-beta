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
  | 'layaway';

export type AppNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  read: boolean;
  createdAt: string;
};
