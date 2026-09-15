import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { registerPushTokenWithWebApi, unregisterPushTokenWithWebApi } from '../api/pushTokenRepository';
import { getSupabase } from '../lib/supabase';
import { resolveEasProjectId } from './resolveEasProjectId';

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

export type RegisterForPushOptions = {
  /**
   * When true (default), show the OS permission dialog if not already granted.
   * Silent auto-register paths should pass false so signup/login can present a
   * contextual in-app gate first — iOS only shows the system prompt once.
   */
  requestPermission?: boolean;
};

export async function registerForPushNotifications(
  options?: RegisterForPushOptions,
): Promise<PushRegistrationResult> {
  const requestPermission = options?.requestPermission !== false;

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
    if (!requestPermission) {
      return { ok: false, reason: 'Notification permission not granted yet.' };
    }
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
      lightColor: '#D4AF37',
    });
  }

  const projectId = resolveEasProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: 'Push is misconfigured (missing EAS project id). Update the app from the store.',
    };
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    return { ok: true, token };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[push] getExpoPushTokenAsync failed', msg);
    if (Platform.OS === 'android') {
      return {
        ok: false,
        reason:
          'Android push is not configured for this build yet. Install the latest app update after FCM credentials are uploaded to EAS.',
      };
    }
    return { ok: false, reason: msg || 'Could not register for push notifications.' };
  }
}

/** User-initiated registration (Settings, notification inbox). */
export async function requestEnablePushNotifications(input: {
  supabaseUserId: string;
  accessToken?: string;
}): Promise<PushRegistrationResult> {
  const res = await registerForPushNotifications();
  if (!res.ok) return res;
  const persisted = await persistPushToken(input.supabaseUserId, res.token, input.accessToken, {
    requireWebSync: true,
  });
  if (!persisted.ok) return { ok: false, reason: persisted.reason };
  return res;
}

export function alertPushRegistrationResult(res: PushRegistrationResult): void {
  if (res.ok) {
    Alert.alert(
      'Notifications enabled',
      'You will get alerts for your orders, messages, live chat tags, offers, and — if you sell — when your own items sell.',
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
  options?: { requireWebSync?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const platform = Platform.OS;
  const deviceName = Device.modelName ?? Device.deviceName ?? null;
  /** Prefer server reassignment so this device stops receiving another account's pushes. */
  const requireWebSync = options?.requireWebSync !== false;

  if (accessToken) {
    const webOk = await registerPushTokenWithWebApi(accessToken, { token, platform, deviceName });
    if (!webOk) {
      if (requireWebSync) {
        return {
          ok: false,
          reason: 'Could not save push token to the server. Check your connection and try again.',
        };
      }
      console.warn('[push] server sync failed; skipping local token save until retry');
      return { ok: false, reason: 'Could not save push token to the server.' };
    }
  } else if (requireWebSync) {
    return { ok: false, reason: 'Sign in again to enable push notifications.' };
  }

  const sb = getSupabase();
  if (sb) {
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
    if (error) {
      console.warn('[push] persistPushToken supabase', error.message);
      // Server already owns the token; local mirror failure should not fail registration.
      return { ok: true };
    }
  }

  return { ok: true };
}

/** Remove server + Supabase push registration for the current session (sign-out / account switch). */
export async function revokePushRegistrationForSession(args: {
  accessToken: string;
  supabaseUserId: string;
  expoPushToken?: string | null;
}): Promise<void> {
  await unregisterPushTokenWithWebApi(args.accessToken, args.expoPushToken ?? undefined);

  const sb = getSupabase();
  if (!sb) return;
  const token = args.expoPushToken?.trim();
  if (token) {
    await sb
      .from('push_device_tokens')
      .delete()
      .eq('user_id', args.supabaseUserId)
      .eq('expo_push_token', token);
  } else {
    await sb.from('push_device_tokens').delete().eq('user_id', args.supabaseUserId);
  }
}

/** Keep the iPhone home-screen app icon badge in sync with unread vault notifications. */
export async function syncAppIconBadge(unreadCount: number): Promise<void> {
  if (!isPushNotificationsAvailable()) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(unreadCount)));
  } catch {
    /* best-effort — simulator / denied permission */
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
