import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type ServerNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export async function fetchVaultNotifications(
  accessToken: string,
  limit = 50,
): Promise<{ notifications: ServerNotificationRow[]; unreadCount: number }> {
  const res = await fetchWebApiAuthed(`/api/notifications?limit=${limit}`, accessToken);
  const body = (await res.json().catch(() => null)) as {
    notifications?: ServerNotificationRow[];
    unreadCount?: number;
  } | null;
  if (!res.ok) return { notifications: [], unreadCount: 0 };
  return {
    notifications: Array.isArray(body?.notifications) ? body!.notifications! : [],
    unreadCount: typeof body?.unreadCount === 'number' ? body.unreadCount : 0,
  };
}
