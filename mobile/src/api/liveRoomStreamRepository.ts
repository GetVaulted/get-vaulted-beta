import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { parseBuyerSafeStreamPayload, type BuyerSafeStreamFields } from '../lib/liveStreamPlayback';

export type StageTokenPayload = {
  token: string;
  participantId: string;
  stageArn: string;
  expiresInSeconds: number;
};

export type ViewerStageToken = StageTokenPayload;

function parseStageTokenPayload(raw: unknown): StageTokenPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const stage = (raw as Record<string, unknown>).stage;
  if (!stage || typeof stage !== 'object') return null;
  const s = stage as Record<string, unknown>;
  const token = typeof s.token === 'string' ? s.token.trim() : '';
  const participantId = typeof s.participantId === 'string' ? s.participantId : '';
  const stageArn = typeof s.stageArn === 'string' ? s.stageArn : '';
  const expiresInSeconds = typeof s.expiresInSeconds === 'number' ? s.expiresInSeconds : 0;
  if (!token) return null;
  return { token, participantId, stageArn, expiresInSeconds };
}

async function stageTokenFetch(
  roomId: string,
  accessToken: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
): Promise<Response | null> {
  if (!accessToken.trim()) return null;
  const withBody = method === 'POST' || method === 'PATCH';
  return fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(withBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(withBody ? { body: '{}' } : {}),
  });
}

export async function fetchBuyerLiveStream(
  roomId: string,
  accessToken?: string,
): Promise<BuyerSafeStreamFields | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/stream`, { headers });
    if (!res.ok) return null;
    const raw = (await res.json().catch(() => null)) as unknown;
    return parseBuyerSafeStreamPayload(raw);
  } catch {
    return null;
  }
}

/** Subscribe-only IVS Real-Time Stage token for authenticated buyers. Requires Bearer auth. */
export async function fetchViewerStageToken(
  roomId: string,
  accessToken: string,
): Promise<ViewerStageToken | null> {
  if (!accessToken.trim()) return null;

  const res = await stageTokenFetch(roomId, accessToken, 'GET');
  if (!res?.ok) return null;
  const raw = (await res.json().catch(() => null)) as unknown;
  return parseStageTokenPayload(raw);
}

/** Host publish token — provisions the Stage, marks stream live, returns publish credentials. */
export async function fetchHostStageToken(
  roomId: string,
  accessToken: string,
): Promise<StageTokenPayload | null> {
  const res = await stageTokenFetch(roomId, accessToken, 'POST');
  if (!res?.ok) return null;
  const raw = (await res.json().catch(() => null)) as unknown;
  return parseStageTokenPayload(raw);
}

function stageTokenErrorMessage(res: Response, raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const err = (raw as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `Stage request failed (${res.status})`;
}

/** Host publish token with error detail for seller Go Live UI. */
export async function requestHostStageToken(
  roomId: string,
  accessToken: string,
): Promise<StageTokenPayload> {
  const res = await stageTokenFetch(roomId, accessToken, 'POST');
  if (!res) throw new Error('Set EXPO_PUBLIC_SITE_URL to your Next.js API host.');
  const raw = (await res.json().catch(() => null)) as unknown;
  const token = parseStageTokenPayload(raw);
  if (!res.ok || !token) throw new Error(stageTokenErrorMessage(res, raw));
  return token;
}

/**
 * Mint a fresh host publish token for an in-progress show without ending the Stage session.
 * Used for proactive refresh before the 60-minute participant token TTL.
 */
export async function refreshHostStageToken(
  roomId: string,
  accessToken: string,
): Promise<StageTokenPayload> {
  const res = await stageTokenFetch(roomId, accessToken, 'PATCH');
  if (!res) throw new Error('Set EXPO_PUBLIC_SITE_URL to your Next.js API host.');
  const raw = (await res.json().catch(() => null)) as unknown;
  const token = parseStageTokenPayload(raw);
  if (!res.ok || !token) throw new Error(stageTokenErrorMessage(res, raw));
  return token;
}

/** End the host WebRTC Stage session (server marks stream ended). */
export async function endHostStageSession(roomId: string, accessToken: string): Promise<void> {
  const res = await stageTokenFetch(roomId, accessToken, 'DELETE');
  if (!res) return;
  if (!res.ok) {
    const raw = (await res.json().catch(() => null)) as unknown;
    throw new Error(stageTokenErrorMessage(res, raw));
  }
}
