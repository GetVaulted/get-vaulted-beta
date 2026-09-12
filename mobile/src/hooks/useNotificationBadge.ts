import { useCallback, useEffect, useState } from 'react';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { resolveRealtimeUserId, useCanonicalUserId } from './useCanonicalUserId';
import { unreadNotificationCount } from '../platform/notificationStore';
import { subscribeNotificationBadge } from '../platform/notificationEvents';

/**
 * Home / settings corner badge count.
 * Must use the same canonical (Prisma) user id as the notification inbox — Supabase auth id
 * can differ on email-linked accounts, which previously left the badge stuck at 0.
 */
export function useNotificationBadge(
  supabaseUserId: string | undefined,
  accessToken: string | undefined,
) {
  const canonicalUserId = useCanonicalUserId(accessToken);
  const inboxUserId = resolveRealtimeUserId(canonicalUserId, supabaseUserId);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!inboxUserId) {
      setCount(0);
      return;
    }
    setCount(await unreadNotificationCount(inboxUserId));
  }, [inboxUserId]);

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
