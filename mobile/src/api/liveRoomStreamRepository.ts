import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { parseBuyerSafeStreamPayload, type BuyerSafeStreamFields } from '../lib/liveStreamPlayback';

export async function fetchBuyerLiveStream(
  roomId: string,
  accessToken?: string,
): Promise<BuyerSafeStreamFields | null> {
  const base = getWebApiBaseUrl();
  if (!base) return null;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${base.replace(/\/$/, '')}/api/live-rooms/${encodeURIComponent(roomId)}/stream`, {
    headers,
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const raw = (await res.json().catch(() => null)) as unknown;
  return parseBuyerSafeStreamPayload(raw);
}
