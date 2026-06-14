import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { registerPushTokenWithWebApi } from '../api/pushTokenRepository';
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

/** User-initiated registration (Settings, notification inbox). */
export async function requestEnablePushNotifications(input: {
  supabaseUserId: string;
  accessToken?: string;
}): Promise<PushRegistrationResult> {
  const res = await registerForPushNotifications();
  if (res.ok) {
    await persistPushToken(input.supabaseUserId, res.token, input.accessToken);
  }
  return res;
}

export function alertPushRegistrationResult(res: PushRegistrationResult): void {
  if (res.ok) {
    Alert.alert(
      'Notifications enabled',
      'You will get alerts when something sells, you receive a message, or an offer comes in.',
    );
    return;
  }
  if (res.reason.toLowerCase().includes('denied')) {
    Alert.alert(
      'Permission needed',
      'Turn on notifications in your device settings to get sale and message alerts.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return;
  }
  if (res.reason.includes('Expo Go') || res.reason.includes('physical device')) {
    Alert.alert(
      'Push unavailable',
      'Use a TestFlight or production build on a physical device. Push does not work in Expo Go or the simulator.',
    );
    return;
  }
  Alert.alert('Could not enable notifications', res.reason);
}

export async function persistPushToken(
  userId: string,
  token: string,
  accessToken?: string,
): Promise<void> {
  const platform = Platform.OS;
  const deviceName = Device.modelName ?? Device.deviceName ?? null;

  if (accessToken) {
    await registerPushTokenWithWebApi(accessToken, { token, platform, deviceName });
  }

  const sb = getSupabase();
  if (!sb) return;
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

export function addNotificationResponseReceivedListener(
  listener: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  if (!isPushNotificationsAvailable()) return noopSubscription;
  return Notifications.addNotificationResponseReceivedListener(listener);
}
