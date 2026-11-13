import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type HostPublisherKind = 'aws_ivs' | 'agora';

export type HostPublisherSelection = {
  publisher: HostPublisherKind;
  /** Agora App ID (public). Needed to open the camera preview before a session exists. */
  agoraAppId: string | null;
};

export type AgoraHostSession = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  expiresInSeconds: number;
};

const AWS_DEFAULT: HostPublisherSelection = { publisher: 'aws_ivs', agoraAppId: null };

export function parseHostPublisher(raw: unknown): HostPublisherSelection {
  if (!raw || typeof raw !== 'object') return AWS_DEFAULT;
  const r = raw as Record<string, unknown>;
  const appId = typeof r.agoraAppId === 'string' ? r.agoraAppId.trim() : '';
  if (r.publisher === 'agora' && appId) return { publisher: 'agora', agoraAppId: appId };
  return AWS_DEFAULT;
}

export function parseAgoraHostSession(raw: unknown): AgoraHostSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = (raw as Record<string, unknown>).agora;
  if (!a || typeof a !== 'object') return null;
  const s = a as Record<string, unknown>;
  const appId = typeof s.appId === 'string' ? s.appId.trim() : '';
  const channel = typeof s.channel === 'string' ? s.channel.trim() : '';
  const token = typeof s.token === 'string' ? s.token.trim() : '';
  const uid = typeof s.uid === 'number' && Number.isFinite(s.uid) ? s.uid : 0;
  const expiresInSeconds = typeof s.expiresInSeconds === 'number' ? s.expiresInSeconds : 0;
  if (!appId || !channel || !token || uid <= 0) return null;
  return { appId, channel, uid, token, expiresInSeconds };
}

function errorMessage(res: Response, raw: unknown, fallback: string): string {
  if (raw && typeof raw === 'object') {
    const err = (raw as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `${fallback} (${res.status})`;
}

function streamPath(roomId: string, suffix: string): string {
  return `/api/live-rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;
}

function authHeaders(accessToken: string, json: boolean): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

/**
 * Which sender should this room use? Any failure falls back to AWS so hosting is never blocked by
 * this lookup.
 */
export async function fetchHostPublisher(roomId: string, accessToken: string): Promise<HostPublisherSelection> {
  if (!accessToken.trim()) return AWS_DEFAULT;
  try {
    const res = await fetchWebApiMobile(
      streamPath(roomId, 'publisher'),
      { method: 'GET', headers: authHeaders(accessToken, false) },
      { timeoutMs: 6_000 },
    );
    if (!res.ok) return AWS_DEFAULT;
    return parseHostPublisher(await res.json().catch(() => null));
  } catch {
    return AWS_DEFAULT;
  }
}

async function sessionCall(
  roomId: string,
  accessToken: string,
  method: 'POST' | 'PATCH',
  timeoutMs: number,
): Promise<AgoraHostSession> {
  const res = await fetchWebApiMobile(
    streamPath(roomId, 'agora'),
    { method, headers: authHeaders(accessToken, true), body: '{}' },
    { timeoutMs },
  );
  if (!res) throw new Error('Set EXPO_PUBLIC_SITE_URL to your Next.js API host.');
  const raw = (await res.json().catch(() => null)) as unknown;
  const session = parseAgoraHostSession(raw);
  if (!res.ok || !session) throw new Error(errorMessage(res, raw, 'Live video request failed'));
  return session;
}

/** Start a phone broadcast on Agora: marks the room as an Agora show and returns join details. */
export function requestAgoraHostSession(roomId: string, accessToken: string): Promise<AgoraHostSession> {
  return sessionCall(roomId, accessToken, 'POST', 45_000);
}

/** Fresh token for a running broadcast (renewal or rejoin). */
export function refreshAgoraHostSession(roomId: string, accessToken: string): Promise<AgoraHostSession> {
  return sessionCall(roomId, accessToken, 'PATCH', 20_000);
}

/**
 * Tell the server this phone is publishing in its Agora channel. The first call turns the show live;
 * repeat calls (~every 25 s) are the heartbeat that keeps it live.
 */
export async function confirmAgoraLive(roomId: string, accessToken: string): Promise<void> {
  const res = await fetchWebApiMobile(
    streamPath(roomId, 'live'),
    { method: 'POST', headers: authHeaders(accessToken, true), body: '{}' },
    { timeoutMs: 15_000 },
  );
  if (!res) throw new Error('Set EXPO_PUBLIC_SITE_URL to your Next.js API host.');
  if (!res.ok) {
    const raw = (await res.json().catch(() => null)) as unknown;
    throw new Error(errorMessage(res, raw, 'Could not start live video'));
  }
}

/** Host stopped: end the server-side session. */
export async function endAgoraHostSession(roomId: string, accessToken: string): Promise<void> {
  if (!accessToken.trim()) return;
  const res = await fetchWebApiMobile(streamPath(roomId, 'agora'), {
    method: 'DELETE',
    headers: authHeaders(accessToken, false),
  });
  if (!res) return;
  if (!res.ok) {
    const raw = (await res.json().catch(() => null)) as unknown;
    throw new Error(errorMessage(res, raw, 'Could not end live video'));
  }
}
