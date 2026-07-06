import { useEffect } from 'react';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { emitNotificationBadgeChanged } from '../platform/notificationEvents';
import { syncServerNotifications } from '../platform/notificationStore';
import {
  addNotificationResponseReceivedListener,
  isPushNotificationsAvailable,
} from '../push/pushRegistrationService';
import {
  getLastHandledNotificationResponseId,
  setLastHandledNotificationResponseId,
  shouldHandleNotificationResponse,
} from '../push/lastHandledNotificationResponse';
import { openNotificationHref } from './openNotificationHref';
import { useNavigation } from '@react-navigation/native';
import { resolveRealtimeUserId, useCanonicalUserId } from '../hooks/useCanonicalUserId';

/** Handle notification taps (cold start + foreground) and refresh inbox after OS delivery. */
export function NotificationDeepLinkEffect() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { user, session } = useAuth();
  const canonicalUserId = useCanonicalUserId(session?.access_token);
  const inboxUserId = resolveRealtimeUserId(canonicalUserId, user?.id);

  useEffect(() => {
    if (!isPushNotificationsAvailable() || !session?.access_token || !inboxUserId) return;

    // Returns whether routing was actually attempted without throwing, so the cold-start path
    // below only marks a tap "handled" after a successful attempt — not before (see comment on
    // that call site). React Navigation's `navigate` can't signal a deeper async failure once
    // it's called, but a synchronous throw during routing is the one failure mode we CAN detect
    // here, and it must not leave the marker set as if the tap had been consumed.
    const handleResponse = (response: Notifications.NotificationResponse): boolean => {
      try {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        const href = typeof data?.href === 'string' ? data.href : '';
        const type = typeof data?.type === 'string' ? data.type : undefined;
        if (href) {
          openNotificationHref(navigation, href, { type });
        } else {
          navigation.navigate('NotificationInbox' as never);
        }
      } catch (err) {
        console.warn('[notifications] failed to route deep link tap', err);
        return false;
      }
      void syncServerNotifications(inboxUserId, session.access_token).then(() => {
        emitNotificationBadgeChanged();
      });
      return true;
    };

    // Expo keeps returning the same "last tapped notification" here until a NEW notification is
    // tapped, so this must only ever be acted on once per unique response — otherwise every
    // subsequent login/app-resume mount would silently re-navigate to a stale destination with
    // no new tap having occurred (see lastHandledNotificationResponse.ts). The marker is persisted
    // AFTER attempting `handleResponse`, not before: if routing throws, the tap is left unmarked
    // so it's retried on the next mount/resume instead of being silently dropped.
    void Notifications.getLastNotificationResponseAsync().then(async (last) => {
      if (last?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const candidateId = last.notification.request.identifier;
      const lastHandledId = await getLastHandledNotificationResponseId(inboxUserId);
      if (!shouldHandleNotificationResponse(candidateId, lastHandledId)) return;
      const handled = handleResponse(last);
      if (handled) {
        await setLastHandledNotificationResponseId(inboxUserId, candidateId);
      }
    });

    const sub = addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [inboxUserId, navigation, session?.access_token]);

  return null;
}
