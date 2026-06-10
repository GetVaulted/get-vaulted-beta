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
import { syncServerNotifications } from '../platform/notificationStore';
import { startVaultRealtimeHub, stopVaultRealtimeHub, subscribeVaultRealtime } from '../realtime/vaultRealtimeHub';

/** Registers push token + starts Supabase realtime hub when user is signed in. */
export function PushRegistrationEffect() {
  const { user, session } = useAuth();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      stopVaultRealtimeHub();
      registered.current = null;
      return;
    }

    startVaultRealtimeHub(user.id);

    const syncNotifications = () => {
      const token = session?.access_token;
      if (token) void syncServerNotifications(user.id, token);
    };

    const unsubRealtime = subscribeVaultRealtime((channel) => {
      if (channel === 'vault_ecosystem' || channel === 'layaway_seller' || channel === 'seller_order') {
        syncNotifications();
      }
    });

    syncNotifications();
    const syncInterval = setInterval(syncNotifications, 60_000);

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
      unsubRealtime();
      clearInterval(syncInterval);
      deferPush.cancel();
      sub.remove();
      stopVaultRealtimeHub();
    };
  }, [session?.access_token, user?.id]);

  return null;
}
