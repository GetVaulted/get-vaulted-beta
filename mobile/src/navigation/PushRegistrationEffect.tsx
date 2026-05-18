import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import {
  addNotificationReceivedListener,
  isPushNotificationsAvailable,
  logPushSkipOnceIfNeeded,
  persistPushToken,
  registerForPushNotifications,
} from '../push/pushRegistrationService';
import { emitNotificationBadgeChanged } from '../platform/notificationEvents';
import { startVaultRealtimeHub, stopVaultRealtimeHub } from '../realtime/vaultRealtimeHub';

/** Registers push token + starts Supabase realtime hub when user is signed in. */
export function PushRegistrationEffect() {
  const { user } = useAuth();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      stopVaultRealtimeHub();
      registered.current = null;
      return;
    }

    startVaultRealtimeHub(user.id);

    if (!isPushNotificationsAvailable()) {
      logPushSkipOnceIfNeeded();
    }

    const deferPush = deferAfterFirstPaint(() => {
      if (!isPushNotificationsAvailable()) return;
      void (async () => {
        if (registered.current === user.id) return;
        const res = await registerForPushNotifications();
        if (res.ok) {
          await persistPushToken(user.id, res.token);
          registered.current = user.id;
        }
      })();
    }, 800);

    const sub = addNotificationReceivedListener(() => {
      emitNotificationBadgeChanged();
    });

    return () => {
      deferPush.cancel();
      sub.remove();
      stopVaultRealtimeHub();
    };
  }, [user?.id]);

  return null;
}
