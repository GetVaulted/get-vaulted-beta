import { useCallback, useEffect, useState } from 'react';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { unreadNotificationCount } from '../platform/notificationStore';
import { subscribeNotificationBadge } from '../platform/notificationEvents';

export function useNotificationBadge(userId: string | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    setCount(await unreadNotificationCount(userId));
  }, [userId]);

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void refresh();
    }, 500);
    return () => task.cancel();
  }, [refresh]);

  useEffect(() => {
    return subscribeNotificationBadge(() => {
      void refresh();
    });
  }, [refresh]);

  return { count, refresh };
}
