import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCanonicalUserId, resolveRealtimeUserId } from '../hooks/useCanonicalUserId';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { getSupabase } from '../lib/supabase';
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

const USER_NOTIFICATIONS_RT_EVENT = 'notification';

function userNotificationsChannel(userId: string): string {
  return `gv-user-${userId}`;
}

/** Registers push token + starts Supabase realtime hub when user is signed in. */
export function PushRegistrationEffect() {
  const { user, session } = useAuth();
  const canonicalUserId = useCanonicalUserId(session?.access_token);
  const realtimeUserId = resolveRealtimeUserId(canonicalUserId, user?.id);
  const inboxUserId = realtimeUserId;
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!realtimeUserId || !session?.access_token) {
      stopVaultRealtimeHub();
      registered.current = null;
      return;
    }

    startVaultRealtimeHub(realtimeUserId);

    const syncNotifications = () => {
      if (!inboxUserId || !session.access_token) return;
      void syncServerNotifications(inboxUserId, session.access_token);
    };

    const unsubRealtime = subscribeVaultRealtime((channel) => {
      if (
        channel === 'vault_ecosystem' ||
        channel === 'layaway_seller' ||
        channel === 'seller_order' ||
        channel === 'user_notification'
      ) {
        syncNotifications();
      }
    });

    const sb = getSupabase();
    let userNotifChannel: RealtimeChannel | null = null;
    if (sb) {
      userNotifChannel = sb
        .channel(userNotificationsChannel(realtimeUserId))
        .on('broadcast', { event: USER_NOTIFICATIONS_RT_EVENT }, () => {
          syncNotifications();
        })
        .subscribe();
    }

    syncNotifications();
    const syncInterval = setInterval(syncNotifications, 60_000);

    if (!isPushNotificationsAvailable()) {
      logPushSkipOnceIfNeeded();
    }

    const deferPush = deferAfterFirstPaint(() => {
      if (!isPushNotificationsAvailable() || !user?.id) return;
      void (async () => {
        try {
          const regKey = `${realtimeUserId}:${session.access_token.slice(0, 12)}`;
          if (registered.current === regKey) return;
          const res = await registerForPushNotifications();
          if (!res.ok) return;
          const persisted = await persistPushToken(user.id, res.token, session.access_token);
          if (persisted.ok) {
            registered.current = regKey;
          } else {
            console.warn('[push] auto-register persist failed', persisted.reason);
          }
        } catch (e) {
          console.warn('[push] auto-register failed', e instanceof Error ? e.message : String(e));
        }
      })();
    }, 800);

    const sub = addNotificationReceivedListener(() => {
      syncNotifications();
      emitNotificationBadgeChanged();
    });

    return () => {
      unsubRealtime();
      clearInterval(syncInterval);
      deferPush.cancel();
      sub.remove();
      if (userNotifChannel && sb) void sb.removeChannel(userNotifChannel);
      stopVaultRealtimeHub();
    };
  }, [inboxUserId, realtimeUserId, session?.access_token, user?.id]);

  return null;
}
