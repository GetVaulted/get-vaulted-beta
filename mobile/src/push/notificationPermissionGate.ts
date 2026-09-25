import * as Notifications from 'expo-notifications';
import { isPushNotificationsAvailable } from './pushRegistrationService';

export type NotificationPermissionGateSource = 'signup' | 'login';

/**
 * Whether we should show the post-auth notification permission screen.
 * Skips Expo Go / simulator (no real push) and already-granted devices.
 */
export async function shouldPromptNotificationPermission(): Promise<boolean> {
  if (!isPushNotificationsAvailable()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status !== 'granted';
  } catch {
    return false;
  }
}
