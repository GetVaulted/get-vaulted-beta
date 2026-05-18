import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSupabase } from '../lib/supabase';

const noopSubscription = { remove: () => {} };

let expoGoSkipLogged = false;

/** Expo Go (SDK 53+) does not support full push APIs — use a dev/EAS build on device. */
export function isPushNotificationsAvailable(): boolean {
  if (Constants.appOwnership === 'expo') return false;
  if (!Device.isDevice) return false;
  return true;
}

/** Dev-only: log once when push is skipped (Expo Go / simulator). */
export function logPushSkipOnceIfNeeded(): void {
  if (expoGoSkipLogged || !__DEV__) return;
  if (Constants.appOwnership !== 'expo' && Device.isDevice) return;
  expoGoSkipLogged = true;
  const reason =
    Constants.appOwnership === 'expo'
      ? 'Expo Go does not support push — use a development or EAS build on a physical device.'
      : 'Push requires a physical device.';
  console.info(`[push] Skipping registration: ${reason}`);
}

function logExpoGoSkipOnce(): void {
  logPushSkipOnceIfNeeded();
}

if (isPushNotificationsAvailable()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!isPushNotificationsAvailable()) {
    if (Constants.appOwnership === 'expo') {
      logExpoGoSkipOnce();
      return {
        ok: false,
        reason: 'Push requires a development or EAS build (not Expo Go).',
      };
    }
    return { ok: false, reason: 'Push requires a physical device.' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { ok: false, reason: 'Notification permission denied.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vault-default', {
      name: 'Vault activity',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 120, 60, 120],
    });
  }

  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    process.env.EAS_PROJECT_ID ??
    undefined;

  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenData.data;
  return { ok: true, token };
}

export async function persistPushToken(userId: string, token: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const platform = Platform.OS;
  const deviceName = Device.modelName ?? Device.deviceName ?? null;
  const { error } = await sb.from('push_device_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform,
      device_name: deviceName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' },
  );
  if (error && __DEV__) {
    console.warn('[push] persistPushToken', error.message);
  }
}

export function addNotificationReceivedListener(
  listener: (n: Notifications.Notification) => void,
): Notifications.EventSubscription {
  if (!isPushNotificationsAvailable()) return noopSubscription;
  return Notifications.addNotificationReceivedListener(listener);
}
