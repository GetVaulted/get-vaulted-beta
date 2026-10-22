import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type WinKind = 'spot' | 'order';

export type WinListItem = {
  kind: WinKind;
  id: string;
  title: string;
  subtitle: string | null;
  showTitle: string | null;
  at: string;
  liveRoomId: string;
};

export type WinClip = {
  title: string;
  subtitle: string | null;
  showTitle: string | null;
  wonAt: string;
  playlistUrl: string;
  momentOffsetSec: number;
  durationSec: number;
};

export async function fetchBuyerWins(accessToken: string): Promise<WinListItem[]> {
  const res = await fetchWebApiMobile('/api/live/win-clips', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = (await res.json().catch(() => null)) as { wins?: WinListItem[]; error?: string } | null;
  if (!res.ok) throw new Error(raw?.error || 'Could not load your wins.');
  return raw?.wins ?? [];
}

export async function fetchWinClip(accessToken: string, kind: WinKind, id: string): Promise<WinClip> {
  const res = await fetchWebApiMobile(`/api/live/win-clips/${kind}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = (await res.json().catch(() => null)) as (Partial<WinClip> & { error?: string }) | null;
  if (!res.ok || !raw?.playlistUrl) {
    throw new Error(raw?.error || 'The video for this moment is not available.');
  }
  return raw as WinClip;
}
