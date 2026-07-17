import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { AppNotification, NotificationKind } from './notificationTypes';

const WEB_KEY = 'gv_notifications_v1';
const FILE = 'gv-notifications-v1.json';

/** Local inbox previously grew without bound, forever re-serializing the whole file on every
 * write (performance audit 2026-07). Cap to the most recent N so writes stay cheap and the
 * unvirtualized inbox screen doesn't render an ever-growing list. */
const MAX_STORED_NOTIFICATIONS = 300;

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

function capStore(store: Store): Store {
  if (store.notifications.length <= MAX_STORED_NOTIFICATIONS) return store;
  // Notifications are always kept newest-first (unshift on push, explicit sort in
  // syncServerNotifications), so trimming the tail drops the oldest rows.
  return { ...store, notifications: store.notifications.slice(0, MAX_STORED_NOTIFICATIONS) };
}

async function save(store: Store): Promise<void> {
  store = capStore(store);
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

export async function clearNotificationStore(): Promise<void> {
  memory = defaultStore();
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(WEB_KEY);
      return;
    }
    const p = path();
    if (p) {
      const info = await FileSystem.getInfoAsync(p);
      if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
    }
  } catch {
    /* best-effort */
  }
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const store = await load();
  return store.notifications.filter((n) => n.userId === userId);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = await listNotifications(userId);
  return rows.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string, accessToken?: string): Promise<void> {
  const store = await load();
  const row = store.notifications.find((n) => n.id === id);
  if (row) row.read = true;
  await save(store);
  if (accessToken && !id.startsWith('nt-')) {
    const { markVaultNotificationRead } = await import('../api/pushTokenRepository');
    void markVaultNotificationRead(accessToken, id);
  }
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
}

export async function markAllNotificationsRead(userId: string, accessToken?: string): Promise<void> {
  const store = await load();
  for (const n of store.notifications) {
    if (n.userId === userId) n.read = true;
  }
  await save(store);
  if (accessToken) {
    const { markAllVaultNotificationsRead } = await import('../api/pushTokenRepository');
    void markAllVaultNotificationsRead(accessToken);
  }
  const { emitNotificationBadgeChanged } = await import('./notificationEvents');
  emitNotificationBadgeChanged();
}

/** Re-run Expo push registration (e.g. from notification settings). */
export function registerPushNotificationHooks(userId: string, accessToken?: string): void {
  void import('../push/pushRegistrationService').then(async ({ registerForPushNotifications, persistPushToken }) => {
    const res = await registerForPushNotifications();
    if (res.ok) await persistPushToken(userId, res.token, accessToken);
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

export async function notifyFollow(
  followedUserId: string,
  followerName: string,
  followerUserId?: string,
): Promise<void> {
  await pushNotification({
    userId: followedUserId,
    kind: 'follow',
    title: 'New follower',
    body: `${followerName} followed your vault.`,
    // Internal-only scheme (never shared as a web URL) resolved directly by `openNotificationHref`
    // to the follower's profile — avoids a needless username lookup since the id is already known
    // at the call site, unlike the server-driven `/seller/{username}` href for the same event.
    href: followerUserId ? `/account/users/${encodeURIComponent(followerUserId)}` : undefined,
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
  message: 'Messages',
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
  if (type === 'chat_mention') return 'message';
  if (LAYAWAY_SERVER_TYPES.has(type)) return 'layaway';
  if (type === 'message_received' || type === 'message_requested') return 'message';
  if (type.includes('counter')) return 'counter';
  if (type.includes('offer')) return 'offer';
  if (type.startsWith('order_') || type === 'item_sold' || type === 'seller_ready_to_ship') return 'order';
  if (type.includes('auction') || type.includes('purchase') || type.includes('break_')) return 'order';
  if (type === 'stripe_dispute') return 'dispute';
  if (type === 'seller_live') return 'live_event';
  if (type === 'new_follower') return 'follow';
  return 'order';
}

/** Exported for tests — the message-thread regex must track the actual server href format
 * (`web/src/app/api/account/threads/[threadId]/route.ts`), not just any `/messages/{id}` path. */
export function parseReferenceFromHref(href: string): { referenceType?: string; referenceId?: string } {
  const path = href.split('?')[0]?.split('#')[0] ?? '';
  const layaway = path.match(/\/layaways\/([^/]+)/);
  if (layaway?.[1]) return { referenceType: 'layaway', referenceId: decodeURIComponent(layaway[1]) };
  // Server sends `/account/messages/{id}`; the bare `/messages/{id}` fallback is kept in case any
  // already-stored notification record was written with the older, unprefixed path.
  const message = path.match(/\/account\/messages\/([^/]+)/) ?? path.match(/\/messages\/([^/]+)/);
  if (message?.[1]) return { referenceType: 'message', referenceId: decodeURIComponent(message[1]) };
  const order = path.match(/\/orders\/([^/]+)/);
  if (order?.[1]) return { referenceType: 'order', referenceId: decodeURIComponent(order[1]) };
  const sellerOrder = path.match(/\/sales\/([^/]+)/);
  if (sellerOrder?.[1] && sellerOrder[1] !== 'layaways') {
    return { referenceType: 'order', referenceId: decodeURIComponent(sellerOrder[1]) };
  }
  const liveRoom = path.match(/^\/live\/([^/]+)/);
  if (liveRoom?.[1]) {
    return { referenceType: 'live_room', referenceId: decodeURIComponent(liveRoom[1]) };
  }
  return {};
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
    const ref = parseReferenceFromHref(n.href);
    store.notifications.unshift({
      id: n.id,
      userId,
      kind: serverTypeToKind(n.type),
      title: n.title,
      body: n.body,
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
      serverType: n.type,
      href: n.href,
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
