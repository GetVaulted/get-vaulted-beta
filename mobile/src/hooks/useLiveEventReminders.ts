import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import {
  loadLiveEventReminderIds,
  setLiveEventReminder,
  type LiveEventReminderTarget,
} from '../lib/liveEventReminder';

export function useLiveEventReminders() {
  const { session, guestExploreMode } = useAuth();
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadLiveEventReminderIds().then(setReminderIds);
  }, []);

  const isReminderSet = useCallback((roomId: string) => reminderIds.has(roomId), [reminderIds]);

  const remind = useCallback(
    async (event: LiveEventReminderTarget, onRequireAuth?: () => void): Promise<boolean> => {
      if (guestExploreMode || !session?.access_token) {
        if (onRequireAuth) {
          onRequireAuth();
        } else {
          Alert.alert('Sign in', 'Sign in to get reminders for vault events.');
        }
        return false;
      }
      const result = await setLiveEventReminder({ event, accessToken: session.access_token });
      if (result.ok) {
        setReminderIds((prev) => new Set(prev).add(event.id));
      } else if (result.error) {
        Alert.alert('Reminder', result.error);
      }
      return result.ok;
    },
    [guestExploreMode, session?.access_token],
  );

  return { remind, isReminderSet, accessToken: session?.access_token };
}
