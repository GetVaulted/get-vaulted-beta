import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type {
  AccountDeletionBlocker,
  Dispute,
  SupportTicket,
  UserReview,
} from './types';

const WEB_KEY = 'gv_platform_v1';
const FILE = 'gv-platform-v1.json';

type Store = {
  v: 1;
  supportTickets: SupportTicket[];
  disputes: Dispute[];
  reviews: UserReview[];
  follows: { followerId: string; followingId: string; createdAt: string }[];
  deletedUserIds: string[];
};

let memory: Store | null = null;

function defaultStore(): Store {
  return {
    v: 1,
    supportTickets: [],
    disputes: [],
    reviews: [],
    follows: [],
    deletedUserIds: [],
  };
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
    for (const r of memory.reviews) {
      if (!Array.isArray(r.tags)) r.tags = [];
    }
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

export async function createSupportTicket(
  ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
): Promise<SupportTicket> {
  const store = await load();
  const now = new Date().toISOString();
  const row: SupportTicket = {
    ...ticket,
    id: `st-${Date.now()}`,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  };
  store.supportTickets.unshift(row);
  await save(store);
  return row;
}

export async function listSupportTickets(userId: string): Promise<SupportTicket[]> {
  const store = await load();
  return store.supportTickets.filter((t) => t.userId === userId);
}

export async function getSupportTicket(id: string): Promise<SupportTicket | null> {
  const store = await load();
  return store.supportTickets.find((t) => t.id === id) ?? null;
}

export async function createDispute(
  dispute: Omit<Dispute, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
): Promise<Dispute> {
  const store = await load();
  const now = new Date().toISOString();
  const row: Dispute = {
    ...dispute,
    id: `dp-${Date.now()}`,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  };
  store.disputes.unshift(row);
  await save(store);
  return row;
}

export async function listDisputes(userId: string): Promise<Dispute[]> {
  const store = await load();
  return store.disputes.filter((d) => d.userId === userId);
}

export async function getDispute(id: string): Promise<Dispute | null> {
  const store = await load();
  return store.disputes.find((d) => d.id === id) ?? null;
}

export async function hasReviewedReference(
  authorId: string,
  referenceId: string,
  reviewType: UserReview['reviewType'],
): Promise<boolean> {
  const store = await load();
  return store.reviews.some(
    (r) => r.authorId === authorId && r.referenceId === referenceId && r.reviewType === reviewType,
  );
}

export async function addReview(review: Omit<UserReview, 'id' | 'createdAt'>): Promise<UserReview> {
  const store = await load();
  const row: UserReview = {
    ...review,
    tags: review.tags ?? [],
    id: `rv-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  store.reviews.unshift(row);
  await save(store);
  return row;
}

export async function countCompletedTradesForUser(userId: string): Promise<number> {
  const store = await load();
  return store.reviews.filter((r) => r.subjectUserId === userId && r.reviewType === 'trade').length;
}

export async function listReviewsForUser(subjectUserId: string): Promise<UserReview[]> {
  const store = await load();
  return store.reviews.filter((r) => r.subjectUserId === subjectUserId);
}

export async function reviewStatsForUser(
  subjectUserId: string,
): Promise<{ count: number; average: number }> {
  const reviews = await listReviewsForUser(subjectUserId);
  if (!reviews.length) return { count: 0, average: 0 };
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return { count: reviews.length, average: Math.round((sum / reviews.length) * 10) / 10 };
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const store = await load();
  return store.follows.some((f) => f.followerId === followerId && f.followingId === followingId);
}

export async function toggleFollow(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false;
  const store = await load();
  const idx = store.follows.findIndex((f) => f.followerId === followerId && f.followingId === followingId);
  if (idx >= 0) {
    store.follows.splice(idx, 1);
    await save(store);
    return false;
  }
  store.follows.push({ followerId, followingId, createdAt: new Date().toISOString() });
  await save(store);
  const { notifyFollow } = await import('./notificationStore');
  await notifyFollow(followingId, 'A collector');
  return true;
}

export async function followerCount(userId: string): Promise<number> {
  const store = await load();
  return store.follows.filter((f) => f.followingId === userId).length;
}

export async function followingCount(userId: string): Promise<number> {
  const store = await load();
  return store.follows.filter((f) => f.followerId === userId).length;
}

export async function markUserDeleted(userId: string): Promise<void> {
  const store = await load();
  if (!store.deletedUserIds.includes(userId)) store.deletedUserIds.push(userId);
  await save(store);
}

export async function isUserDeleted(userId: string): Promise<boolean> {
  const store = await load();
  return store.deletedUserIds.includes(userId);
}

export async function getAccountDeletionBlockers(
  userId: string,
  opts?: { activeTradeCount?: number; openDisputeCount?: number; pendingPayout?: boolean },
): Promise<AccountDeletionBlocker[]> {
  const blockers: AccountDeletionBlocker[] = [];
  if ((opts?.activeTradeCount ?? 0) > 0) {
    blockers.push({
      code: 'active_trade',
      message: 'You have active vault trades. Complete or cancel them before deleting your account.',
    });
  }
  const disputes = await listDisputes(userId);
  const open = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed');
  if (open.length > 0) {
    blockers.push({
      code: 'open_dispute',
      message: 'You have open disputes under review. Resolve them before account deletion.',
    });
  }
  if (opts?.pendingPayout) {
    blockers.push({
      code: 'pending_payout',
      message: 'A payout is pending on your seller account. Finish payout setup or wait for settlement.',
    });
  }
  return blockers;
}
