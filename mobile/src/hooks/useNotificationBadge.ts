import { useCallback, useEffect, useState } from 'react';
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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeNotificationBadge(() => {
      void refresh();
    });
  }, [refresh]);

  return { count, refresh };
}
