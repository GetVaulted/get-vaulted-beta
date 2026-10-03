import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(memory.keys())),
    getItem: vi.fn(async (key: string) => (memory.has(key) ? memory.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  },
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
}));

vi.mock('../api/sellerFollowRepository', () => ({
  fetchSellerFollowStatus: vi.fn(async () => ({ following: true, isSelf: false })),
  setSellerFollow: vi.fn(async () => {}),
}));

import {
  getLiveEventReminderIdsCache,
  loadLiveEventReminderIds,
  setLiveEventReminder,
  subscribeLiveEventReminders,
} from './liveEventReminder';

function collector() {
  const seen = new Set<string>();
  const listener = (ids: Set<string>) => {
    seen.clear();
    ids.forEach((id) => seen.add(id));
  };
  return { seen, listener };
}

describe('liveEventReminder shared store (cross-screen sync)', () => {
  beforeEach(async () => {
    memory.clear();
    // Reset the process-wide cache to empty for each test.
    await loadLiveEventReminderIds();
  });

  it('propagates a reminder set on one screen to every subscribed screen', async () => {
    const liveTab = collector();
    const homeScreen = collector();
    const unsubA = subscribeLiveEventReminders(liveTab.listener);
    const unsubB = subscribeLiveEventReminders(homeScreen.listener);

    await setLiveEventReminder({
      event: {
        id: 'room-1',
        title: 'Break Night',
        hostUserId: 'host-1',
        hostName: 'Bryan',
        startsAtIso: null,
      },
      accessToken: 'token',
    });

    // Both screens (and the shared cache) reflect the reminder without remounting.
    expect(liveTab.seen.has('room-1')).toBe(true);
    expect(homeScreen.seen.has('room-1')).toBe(true);
    expect(getLiveEventReminderIdsCache().has('room-1')).toBe(true);

    unsubA();
    unsubB();
  });

  it('a screen mounting later seeds from the shared cache immediately', async () => {
    await setLiveEventReminder({
      event: { id: 'room-9', title: 'X', hostUserId: 'h', hostName: 'H', startsAtIso: null },
      accessToken: 'token',
    });
    // A brand-new hook instance would read this synchronously before any storage load resolves.
    expect(getLiveEventReminderIdsCache().has('room-9')).toBe(true);
  });

  it('stops notifying after unsubscribe', async () => {
    let calls = 0;
    const unsub = subscribeLiveEventReminders(() => {
      calls += 1;
    });
    unsub();

    await setLiveEventReminder({
      event: { id: 'room-2', title: 'X', hostUserId: 'h', hostName: 'H', startsAtIso: null },
      accessToken: 'token',
    });

    expect(calls).toBe(0);
  });
});
