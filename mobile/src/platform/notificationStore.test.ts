import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  documentDirectory: '/docs/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));

vi.mock('./notificationEvents', () => ({
  emitNotificationBadgeChanged: vi.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';

async function importFreshModule() {
  vi.resetModules();
  return import('./notificationStore');
}

// Regression: the local notification inbox previously grew without bound, re-serializing an
// ever-larger file on every single write (performance audit 2026-07).
describe('notificationStore — bounded size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false });
  });

  it('caps stored notifications to the most recent N, keeping newest first', async () => {
    const { pushNotification } = await importFreshModule();

    const total = 320;
    for (let i = 0; i < total; i += 1) {
      await pushNotification({
        userId: 'u1',
        kind: 'follow',
        title: `Notification ${i}`,
        body: 'body',
      });
    }

    const writeCalls = (FileSystem.writeAsStringAsync as ReturnType<typeof vi.fn>).mock.calls;
    const lastWrite = writeCalls[writeCalls.length - 1];
    const written = JSON.parse(lastWrite[1] as string) as { notifications: { title: string }[] };

    expect(written.notifications.length).toBeLessThanOrEqual(300);
    // Most recently pushed notification should survive the cap.
    expect(written.notifications[0]?.title).toBe(`Notification ${total - 1}`);
  });
});

// FIX 6 — the actual server href format is `/account/messages/{id}` (see
// web/src/app/api/account/threads/[threadId]/route.ts), not the bare `/messages/{id}` this used
// to look for, so any code path that independently re-parses a stored href (rather than going
// through openNotificationHref.ts) must recognize the real path.
describe('parseReferenceFromHref — message hrefs', () => {
  it('parses the real server format /account/messages/{id}', async () => {
    const { parseReferenceFromHref } = await importFreshModule();
    expect(parseReferenceFromHref('/account/messages/thread_1')).toEqual({
      referenceType: 'message',
      referenceId: 'thread_1',
    });
  });

  it('still parses the legacy bare /messages/{id} format for old stored records', async () => {
    const { parseReferenceFromHref } = await importFreshModule();
    expect(parseReferenceFromHref('/messages/thread_1')).toEqual({
      referenceType: 'message',
      referenceId: 'thread_1',
    });
  });

  it('decodes an encoded thread id', async () => {
    const { parseReferenceFromHref } = await importFreshModule();
    expect(parseReferenceFromHref(`/account/messages/${encodeURIComponent('thread 1')}`)).toEqual({
      referenceType: 'message',
      referenceId: 'thread 1',
    });
  });
});

// FIX 4 — notifyFollow previously never set an href, so tapping a "new follower" notification
// was a dead end (mark-read-only). It should now link to the follower's profile.
describe('notifyFollow — href', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false });
  });

  it('sets an href to the follower profile when a followerUserId is provided', async () => {
    const { notifyFollow, listNotifications } = await importFreshModule();
    await notifyFollow('followed-1', 'Alex', 'follower-1');
    const rows = await listNotifications('followed-1');
    expect(rows[0]?.href).toBe('/account/users/follower-1');
  });

  it('leaves href unset when no followerUserId is available', async () => {
    const { notifyFollow, listNotifications } = await importFreshModule();
    await notifyFollow('followed-1', 'A collector');
    const rows = await listNotifications('followed-1');
    expect(rows[0]?.href).toBeUndefined();
  });
});
