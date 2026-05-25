import type { LiveRoomItemRow } from './liveRoomControlRepository';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type HostStreamPayload = {
  roomId: string;
  streamProvider: string;
  streamHealth: string;
  playbackUrl: string | null;
  streamStartedAt: string | null;
  streamEndedAt: string | null;
  lastStatusSyncAt: string | null;
  ingestEndpoint?: string | null;
  lastIvsError?: string | null;
};

export type LiveRoomHostDetail = {
  id: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  description?: string | null;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type SellerLiveReadiness = {
  canGoLive: boolean;
  issues: string[];
  checks?: Record<string, boolean>;
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string; code?: string };
    if (o.code === 'LIVE_COMING_SOON' || res.status === 503) {
      return (
        'Live is disabled on this server. Redeploy beta with the latest web build, or set LIVE_MARKETPLACE_ENABLED=1 in Netlify env (and clear LIVE_MARKETPLACE_COMING_SOON).'
      );
    }
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

async function hostFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

export async function fetchLiveRoomForHost(
  accessToken: string,
  roomId: string,
): Promise<LiveRoomHostDetail> {
  const res = await hostFetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, accessToken);
  let j: { room?: LiveRoomHostDetail; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.room?.id) throw new Error('Room not found.');
  return j.room;
}

export async function fetchSellerLiveReadiness(accessToken: string): Promise<SellerLiveReadiness> {
  const res = await hostFetch('/api/seller/live-readiness', accessToken);
  let j: SellerLiveReadiness & { error?: string } = { canGoLive: false, issues: [] };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return { canGoLive: Boolean(j.canGoLive), issues: Array.isArray(j.issues) ? j.issues : [], checks: j.checks };
}

export async function patchLiveRoomAction(
  accessToken: string,
  roomId: string,
  action: 'start' | 'end',
): Promise<void> {
  const res = await hostFetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  let j: { error?: string; issues?: string[] } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const base = apiErrorMessage(res, j);
    if (Array.isArray(j.issues) && j.issues.length > 0) {
      throw new Error(`${base}\n\n${j.issues.join('\n')}`);
    }
    throw new Error(base);
  }
}

export async function fetchHostStream(
  accessToken: string,
  roomId: string,
  opts?: { sync?: boolean },
): Promise<{ stream: HostStreamPayload; viewerRole: string }> {
  const q = opts?.sync ? '?sync=1' : '';
  const res = await hostFetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream${q}`, accessToken);
  let j: { stream?: HostStreamPayload; viewerRole?: string; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (j.viewerRole !== 'host') throw new Error('Only the room host can manage the stream.');
  if (!j.stream) throw new Error('Stream status unavailable.');
  return { stream: j.stream, viewerRole: j.viewerRole ?? 'host' };
}

export async function provisionHostStream(
  accessToken: string,
  roomId: string,
): Promise<{ stream: HostStreamPayload; ingestEndpoint: string; oneTimeStreamKey: string }> {
  const res = await hostFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/stream/provision`,
    accessToken,
    { method: 'POST', body: '{}' },
  );
  let j: {
    stream?: HostStreamPayload;
    ingest?: { endpoint?: string; oneTimeStreamKey?: string };
    error?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  const endpoint = j.ingest?.endpoint?.trim() ?? j.stream?.ingestEndpoint?.trim() ?? '';
  const key = j.ingest?.oneTimeStreamKey?.trim() ?? '';
  if (!endpoint || !key) throw new Error('Stream provision did not return ingest details.');
  if (!j.stream) throw new Error('Stream provision incomplete.');
  return { stream: j.stream, ingestEndpoint: endpoint, oneTimeStreamKey: key };
}

export type HostConsoleRoom = LiveRoomHostDetail & {
  viewerCount: number;
  thumbnailUrl?: string | null;
  category?: string;
};

export type HostConsoleMessage = {
  id: string;
  senderId?: string;
  senderUsername: string;
  body: string;
  messageType?: 'chat' | 'bid' | 'purchase' | 'system';
  createdAt: string;
};

export type HostConsolePayload = {
  serverNowMs: number;
  room: HostConsoleRoom;
  items: LiveRoomItemRow[];
  activeItem: LiveRoomItemRow | null;
  recentSalesTotalUsd: number;
  messages: HostConsoleMessage[];
};

export async function fetchHostConsole(accessToken: string, roomId: string): Promise<HostConsolePayload> {
  const res = await hostFetch(`/api/live-rooms/${encodeURIComponent(roomId)}/host-console`, accessToken);
  let j: {
    serverNowMs?: number;
    room?: HostConsoleRoom & { viewerCount?: number };
    queueItems?: { item: LiveRoomItemRow }[];
    messages?: HostConsoleMessage[];
    recentSales?: { amountUsd?: number }[];
    error?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.room?.id) throw new Error('Host console unavailable.');
  const items = (j.queueItems ?? []).map((q) => q.item).filter(Boolean);
  const activeItem = items.find((i) => i.status === 'active') ?? null;
  const recentSalesTotalUsd = (j.recentSales ?? []).reduce((sum, s) => {
    const n = typeof s.amountUsd === 'number' ? s.amountUsd : 0;
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const messages = Array.isArray(j.messages) ? j.messages : [];
  return {
    serverNowMs: j.serverNowMs ?? Date.now(),
    room: { ...j.room, viewerCount: j.room.viewerCount ?? 0 },
    items,
    activeItem,
    recentSalesTotalUsd,
    messages,
  };
}

export async function rotateHostStreamKey(
  accessToken: string,
  roomId: string,
): Promise<{ stream: HostStreamPayload; ingestEndpoint: string; oneTimeStreamKey: string }> {
  const res = await hostFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/stream/rotate-key`,
    accessToken,
    { method: 'POST', body: '{}' },
  );
  let j: {
    stream?: HostStreamPayload;
    ingest?: { endpoint?: string; oneTimeStreamKey?: string };
    error?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  const endpoint = j.ingest?.endpoint?.trim() ?? j.stream?.ingestEndpoint?.trim() ?? '';
  const key = j.ingest?.oneTimeStreamKey?.trim() ?? '';
  if (!endpoint || !key) throw new Error('Could not rotate stream key.');
  if (!j.stream) throw new Error('Stream key rotated but status missing.');
  return { stream: j.stream, ingestEndpoint: endpoint, oneTimeStreamKey: key };
}
