import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export const LIVE_TIP_PRESET_AMOUNTS_USD = [5, 10, 20, 50] as const;
export const LIVE_TIP_MIN_USD = 1;
export const LIVE_TIP_MAX_USD = 500;

export async function startLiveTipCheckout(
  accessToken: string,
  liveRoomId: string,
  body: { amountUsd: number; message?: string },
): Promise<{ url: string; liveTipId: string }> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL to send tips.');

  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const j = (await res.json().catch(() => ({}))) as { url?: string; liveTipId?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : 'Could not start tip checkout.');
  }
  if (!j.url) throw new Error('Could not start tip checkout.');
  return { url: j.url, liveTipId: j.liveTipId ?? '' };
}
