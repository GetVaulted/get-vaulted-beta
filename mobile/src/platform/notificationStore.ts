import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { AppNotification, NotificationKind } from './notificationTypes';

const WEB_KEY = 'gv_notifications_v1';
const FILE = 'gv-notifications-v1.json';

type Store = { v: 1; notifications: AppNotification[] };

let memory: Store | null = null;

function defaultStore(): Store {
  return { v: 1, notifications: [] };
}

function path(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  return base ? `${base}${FILE}` : null;
}

async function load(): Promise<Store> {
  if (memory) return memory;
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(WEB_KEY);
      memory = raw ? (JSON.parse(raw) as Store) : defaultStore();
      return memory;
    }
    const p = path();
    if (!p) {
      memory = defaultStore();
      return memory;
    }
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) {
      memory = defaultStore();
      return memory;
    }
    memory = JSON.parse(await FileSystem.readAsStringAsync(p)) as Store;
    return memory;
  } catch {
    memory = defaultStore();
    return memory;
  }
}

async function save(store: Store): Promise<void> {
  memory = store;
  try {
    const serialized = JSON.stringify(store);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(WEB_KEY, serialized);
      return;
    }
    const p = path();
    if (p) await FileSystem.writeAsStringAsync(p, serialized);
  } catch {
    /* best-effort */
  }
}

export async function pushNotification(
  n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>,
): Promise<AppNotification> {
  const store = await load();
  const row: AppNotification = {
    ...n,
    id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  store.notifications.unshift(row);
  await save(store);
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
  return row;
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const store = await load();
  return store.notifications.filter((n) => n.userId === userId);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = await listNotifications(userId);
  return rows.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  const store = await load();
  const row = store.notifications.find((n) => n.id === id);
  if (row) row.read = true;
  await save(store);
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const store = await load();
  for (const n of store.notifications) {
    if (n.userId === userId) n.read = true;
  }
  await save(store);
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
}

/** Re-run Expo push registration (e.g. from notification settings). */
export function registerPushNotificationHooks(userId: string): void {
  void import('../push/pushRegistrationService').then(async ({ registerForPushNotifications, persistPushToken }) => {
    const res = await registerForPushNotifications();
    if (res.ok) await persistPushToken(userId, res.token);
  });
}

export async function notifyReviewReceived(
  subjectUserId: string,
  authorName: string,
  rating: number,
  referenceId?: string,
): Promise<void> {
  await pushNotification({
    userId: subjectUserId,
    kind: 'review' satisfies NotificationKind,
    title: 'New vault review',
    body: `${authorName} left a ${rating}-star review.`,
    referenceType: 'review',
    referenceId,
  });
}

export async function notifyFollow(followedUserId: string, followerName: string): Promise<void> {
  await pushNotification({
    userId: followedUserId,
    kind: 'follow',
    title: 'New follower',
    body: `${followerName} followed your vault.`,
  });
}

export async function notifyReviewReminder(
  userId: string,
  listingTitle: string,
  orderId: string,
  asBuyer: boolean,
): Promise<void> {
  await pushNotification({
    userId,
    kind: 'review',
    title: 'Review your vault order',
    body: asBuyer
      ? `Rate your experience on “${listingTitle}”.`
      : `Optional: rate your buyer on “${listingTitle}”.`,
    referenceType: 'order',
    referenceId: orderId,
  });
}

export type NotificationGroup = {
  kind: import('./notificationTypes').NotificationKind;
  label: string;
  items: AppNotification[];
  unread: number;
};

const KIND_LABELS: Record<import('./notificationTypes').NotificationKind, string> = {
  follow: 'Follows',
  live_event: 'Live events',
  offer: 'Offers',
  counter: 'Counters',
  review: 'Reviews',
  support: 'Support',
  dispute: 'Disputes',
  trade: 'Trades',
  order: 'Orders',
  layaway: 'Layaways',
};

const LAYAWAY_SERVER_TYPES = new Set([
  'layaway_started',
  'layaway_started_seller',
  'layaway_payment',
  'layaway_payment_seller',
  'layaway_completed',
  'layaway_completed_seller',
  'layaway_defaulted',
  'layaway_defaulted_seller',
]);

function serverTypeToKind(type: string): NotificationKind {
  if (LAYAWAY_SERVER_TYPES.has(type)) return 'layaway';
  if (type.startsWith('order_') || type === 'item_sold' || type === 'seller_ready_to_ship') return 'order';
  if (type.includes('offer') || type.includes('counter')) return 'offer';
  return 'order';
}

function parseLayawayIdFromHref(href: string): string | undefined {
  const m = href.match(/\/layaways\/([^/?#]+)/);
  return m?.[1];
}

/** Merge server notifications into the local inbox (deduped by server id). */
export async function syncServerNotifications(
  userId: string,
  accessToken: string,
): Promise<void> {
  const { fetchVaultNotifications } = await import('../api/notificationsRepository');
  const { notifications } = await fetchVaultNotifications(accessToken, 60);
  if (!notifications.length) return;

  const store = await load();
  const existingIds = new Set(store.notifications.map((n) => n.id));

  for (const n of notifications) {
    if (existingIds.has(n.id)) continue;
    const layawayId = parseLayawayIdFromHref(n.href);
    store.notifications.unshift({
      id: n.id,
      userId,
      kind: serverTypeToKind(n.type),
      title: n.title,
      body: n.body,
      referenceType: layawayId ? 'layaway' : undefined,
      referenceId: layawayId,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    });
    existingIds.add(n.id);
  }

  store.notifications.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  await save(store);
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
}

export function groupNotifications(rows: AppNotification[]): NotificationGroup[] {
  const map = new Map<string, NotificationGroup>();
  for (const n of rows) {
    let g = map.get(n.kind);
    if (!g) {
      g = { kind: n.kind, label: KIND_LABELS[n.kind] ?? n.kind, items: [], unread: 0 };
      map.set(n.kind, g);
    }
    g.items.push(n);
    if (!n.read) g.unread += 1;
  }
  return [...map.values()];
}
