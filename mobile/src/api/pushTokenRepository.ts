import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePushTokenStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export async function registerPushTokenWithWebApi(
  accessToken: string,
  input: { token: string; platform: string; deviceName: string | null },
): Promise<boolean> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetchWebApiAuthed('/api/account/push-token', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) return true;

    const body = await res.text().catch(() => '');
    const retryable = isRetryablePushTokenStatus(res.status);
    if (!retryable || attempt === maxAttempts) {
      console.warn('[push] registerPushTokenWithWebApi failed', res.status, body.slice(0, 200));
      return false;
    }
    await sleep(400 * attempt);
  }
  return false;
}

/** Drop this device's token (or all tokens) from the signed-in account — call before sign-out. */
export async function unregisterPushTokenWithWebApi(
  accessToken: string,
  token?: string,
): Promise<void> {
  const res = await fetchWebApiAuthed('/api/account/push-token', accessToken, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token?.trim() ? { token: token.trim() } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[push] unregisterPushTokenWithWebApi failed', res.status, body.slice(0, 200));
  }
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
