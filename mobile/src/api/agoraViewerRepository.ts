import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type AgoraViewerSession = {
  appId: string;
  channel: string;
  /** Uid of the host's published stream. */
  hostUid: number;
  /** Uid to join with; 0 lets Agora assign one. */
  uid: number;
  token: string;
  expiresInSeconds: number;
};

export function parseAgoraViewerSession(raw: unknown): AgoraViewerSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = (raw as Record<string, unknown>).agora;
  if (!a || typeof a !== 'object') return null;
  const s = a as Record<string, unknown>;
  const appId = typeof s.appId === 'string' ? s.appId.trim() : '';
  const channel = typeof s.channel === 'string' ? s.channel.trim() : '';
  const token = typeof s.token === 'string' ? s.token.trim() : '';
  const hostUid = typeof s.hostUid === 'number' && Number.isFinite(s.hostUid) ? s.hostUid : 0;
  const uid = typeof s.uid === 'number' && Number.isFinite(s.uid) ? s.uid : 0;
  const expiresInSeconds = typeof s.expiresInSeconds === 'number' ? s.expiresInSeconds : 0;
  if (!appId || !channel || !token || hostUid <= 0) return null;
  return { appId, channel, hostUid, uid, token, expiresInSeconds };
}

/** Subscribe-only pass for a room that is on Agora. Works signed in or as a guest. */
export async function fetchAgoraViewerSession(roomId: string, accessToken?: string): Promise<AgoraViewerSession> {
  const headers: Record<string, string> = accessToken?.trim() ? { Authorization: `Bearer ${accessToken.trim()}` } : {};
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(roomId)}/stream/agora-viewer`,
    { method: 'GET', headers },
    { timeoutMs: 12_000 },
  );
  if (!res) throw new Error('Set EXPO_PUBLIC_SITE_URL to your Next.js API host.');
  const raw = (await res.json().catch(() => null)) as unknown;
  const session = parseAgoraViewerSession(raw);
  if (!res.ok || !session) {
    const msg = raw && typeof raw === 'object' ? (raw as { error?: string }).error : undefined;
    throw new Error(typeof msg === 'string' && msg.trim() ? msg.trim() : `Live video request failed (${res.status})`);
  }
  return session;
}
