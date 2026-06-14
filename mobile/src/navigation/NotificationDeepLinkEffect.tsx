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

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const href = typeof data?.href === 'string' ? data.href : '';
      const type = typeof data?.type === 'string' ? data.type : undefined;
      if (href) {
        openNotificationHref(navigation, href, { type });
      } else {
        navigation.navigate('NotificationInbox' as never);
      }
      void syncServerNotifications(inboxUserId, session.access_token).then(() => {
        emitNotificationBadgeChanged();
      });
    };

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (last?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        handleResponse(last);
      }
    });

    const sub = addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [inboxUserId, navigation, session?.access_token]);

  return null;
}
