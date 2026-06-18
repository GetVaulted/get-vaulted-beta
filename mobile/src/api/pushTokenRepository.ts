import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export async function registerPushTokenWithWebApi(
  accessToken: string,
  input: { token: string; platform: string; deviceName: string | null },
): Promise<boolean> {
  const res = await fetchWebApiAuthed('/api/account/push-token', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[push] registerPushTokenWithWebApi failed', res.status, body.slice(0, 200));
    return false;
  }
  return true;
}

export async function markVaultNotificationRead(accessToken: string, notificationId: string): Promise<void> {
  await fetchWebApiAuthed(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    accessToken,
    { method: 'PATCH' },
  );
}

export async function markAllVaultNotificationsRead(accessToken: string): Promise<void> {
  await fetchWebApiAuthed('/api/notifications/read-all', accessToken, { method: 'PATCH' });
}
