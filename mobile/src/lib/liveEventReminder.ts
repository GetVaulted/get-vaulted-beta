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

export async function loadLiveEventReminderIds(): Promise<Set<string>> {
  const keys = await AsyncStorage.getAllKeys();
  const ids = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      ids.add(key.slice(STORAGE_PREFIX.length));
    }
  }
  return ids;
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
