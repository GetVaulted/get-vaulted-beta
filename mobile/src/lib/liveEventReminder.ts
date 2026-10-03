import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { fetchSellerFollowStatus, setSellerFollow } from '../api/sellerFollowRepository';

const STORAGE_PREFIX = 'live_event_reminder:';

export type LiveEventReminderTarget = {
  id: string;
  title: string;
  hostUserId: string;
  hostName: string;
  startsAtIso?: string | null;
};

function storageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId}`;
}

function notificationId(roomId: string): string {
  return `live-reminder-${roomId}`;
}

// Process-wide reminder cache + subscription so every screen (Home, Live tab, cards) reflects the
// same set instantly. Without this, each screen's hook loaded its own snapshot once on mount, so a
// reminder set on the Live tab never propagated to the Home screen until it remounted.
let reminderCache: Set<string> | null = null;
const reminderListeners = new Set<(ids: Set<string>) => void>();

function emitReminderChange(): void {
  const snapshot = new Set(reminderCache ?? []);
  for (const listener of reminderListeners) listener(snapshot);
}

/** Current in-memory reminder ids (empty until the first load). Returns a fresh copy. */
export function getLiveEventReminderIdsCache(): Set<string> {
  return new Set(reminderCache ?? []);
}

/** Subscribe to reminder-set changes across the app. Returns an unsubscribe fn. */
export function subscribeLiveEventReminders(listener: (ids: Set<string>) => void): () => void {
  reminderListeners.add(listener);
  return () => {
    reminderListeners.delete(listener);
  };
}

export async function loadLiveEventReminderIds(): Promise<Set<string>> {
  const keys = await AsyncStorage.getAllKeys();
  const ids = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      ids.add(key.slice(STORAGE_PREFIX.length));
    }
  }
  reminderCache = ids;
  emitReminderChange();
  return new Set(ids);
}

export async function isLiveEventReminderSet(roomId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(storageKey(roomId))) === '1';
}

export async function setLiveEventReminder(args: {
  event: LiveEventReminderTarget;
  accessToken: string;
}): Promise<{ ok: boolean; alreadySet?: boolean; error?: string }> {
  const already = await isLiveEventReminderSet(args.event.id);
  if (already) {
    // Keep the shared cache authoritative even if this screen never loaded it.
    if (!reminderCache) reminderCache = new Set();
    if (!reminderCache.has(args.event.id)) {
      reminderCache.add(args.event.id);
      emitReminderChange();
    }
    Alert.alert('Reminder set', `You're already set to be notified about ${args.event.title}.`);
    return { ok: true, alreadySet: true };
  }

  const followStatus = await fetchSellerFollowStatus(args.event.hostUserId, args.accessToken);
  if (followStatus && !followStatus.following && !followStatus.isSelf) {
    await setSellerFollow(args.event.hostUserId, true, args.accessToken);
  }

  let scheduledLocal = false;
  const startIso = args.event.startsAtIso?.trim() || null;
  if (startIso) {
    const startMs = Date.parse(startIso);
    if (!Number.isNaN(startMs) && startMs > Date.now() + 60_000) {
      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status === 'granted') {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('vault-default', {
            name: 'Vault activity',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }
        await Notifications.scheduleNotificationAsync({
          identifier: notificationId(args.event.id),
          content: {
            title: 'Vault event starting',
            body: `${args.event.title} with ${args.event.hostName} is starting now.`,
            data: { href: `/live/${args.event.id}`, type: 'live_reminder' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(startMs),
          },
        });
        scheduledLocal = true;
      }
    }
  }

  await AsyncStorage.setItem(storageKey(args.event.id), '1');
  if (!reminderCache) reminderCache = new Set();
  reminderCache.add(args.event.id);
  emitReminderChange();

  const message = scheduledLocal
    ? `We'll notify you when ${args.event.title} starts. You're also following ${args.event.hostName} for go-live alerts.`
    : `You're following ${args.event.hostName}. You'll get a push when they go live.`;

  Alert.alert('Reminder set', message);
  return { ok: true };
}

export function scheduledStreamReminderTarget(event: {
  id: string;
  title: string;
  host: { id: string; name: string };
  scheduledStartAtIso?: string | null;
}): LiveEventReminderTarget {
  return {
    id: event.id,
    title: event.title,
    hostUserId: event.host.id,
    hostName: event.host.name,
    startsAtIso: event.scheduledStartAtIso ?? null,
  };
}

export function liveStreamReminderTarget(stream: {
  id: string;
  title: string;
  host: { id: string; name: string };
  scheduledStartAtIso?: string | null;
}): LiveEventReminderTarget {
  return {
    id: stream.id,
    title: stream.title,
    hostUserId: stream.host.id,
    hostName: stream.host.name.trim() || stream.host.id,
    startsAtIso: stream.scheduledStartAtIso ?? null,
  };
}
