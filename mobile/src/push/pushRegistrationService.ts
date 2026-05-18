import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSupabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
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
  return Notifications.addNotificationReceivedListener(listener);
}
