import type { LiveRoomItemRow } from './liveRoomControlRepository';
import type { LiveGiveawayRow } from './liveGiveawayRepository';
import { apiFailureErrorMessage } from '../lib/betaApiResponse';
import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';
import { readThroughHostConsoleCache } from '../lib/hostConsoleCache';
import { logVaultCommandCenter, supabaseJwtSub } from '../lib/logVaultCommandCenterFlow';
import { parseWebApiJsonBody, readWebApiResponseText } from '../lib/webApiResponse';

export type LiveHostApiErrorBody = {
  error?: string;
  code?: string;
  detail?: string;
  hint?: string;
};

export class LiveHostApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly endpoint: string;
  readonly detail?: string;
  readonly hint?: string;

  constructor(endpoint: string, status: number, body: LiveHostApiErrorBody) {
    const base =
      typeof body.error === 'string' && body.error.trim()
        ? body.error.trim()
        : `Request failed (${status})`;
    const detail = typeof body.detail === 'string' ? body.detail.trim() : '';
    const withDetail =
      detail && !base.includes(detail)
        ? `${base}${detail.length > 160 ? `: ${detail.slice(0, 160)}…` : `: ${detail}`}`
        : base;
    const withCode = body.code ? `${withDetail} [${body.code}]` : withDetail;
    super(withCode);
    this.name = 'LiveHostApiError';
    this.status = status;
    this.code = body.code;
    this.endpoint = endpoint;
    this.detail = typeof body.detail === 'string' ? body.detail : undefined;
    this.hint = typeof body.hint === 'string' ? body.hint : undefined;
  }
}

export type HostStreamPayload = {
  roomId: string;
  streamProvider: string;
  streamHealth: string;
  streamPaused?: boolean;
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
  /** In-room show notes (not discovery description). */
  showNotes?: string | null;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type SellerLiveReadiness = {
  canGoLive: boolean;
  issues: string[];
  checks?: Record<string, boolean>;
  /** Prisma seller id from `/api/seller/live-readiness` (same auth as POST /api/live-rooms). */
  sellerUserId?: string;
};

function parseApiBody(body: unknown): LiveHostApiErrorBody {
  if (body && typeof body === 'object') return body as LiveHostApiErrorBody;
  return {};
}

function apiErrorMessage(res: Response, body: unknown): string {
  const parsed = parseApiBody(body);
  if (parsed.code === 'LIVE_COMING_SOON' || res.status === 503) {
    return 'Live is disabled on this server. Redeploy beta with the latest web build, or set LIVE_MARKETPLACE_ENABLED=1 in Netlify env (and clear LIVE_MARKETPLACE_COMING_SOON).';
  }
  if (typeof parsed.error === 'string' && parsed.error.trim()) {
    return parsed.code ? `${parsed.error.trim()} [${parsed.code}]` : parsed.error.trim();
  }
  return `Request failed (${res.status})`;
}

function throwHostApiError(
  endpoint: string,
  res: Response,
  body: LiveHostApiErrorBody,
  bodyPreview?: string,
): never {
  const parsed = parseApiBody(body);
  if (parsed.code === 'LIVE_COMING_SOON') {
    throw new Error(
      'Live is disabled on this server. Redeploy beta with the latest web build, or set LIVE_MARKETPLACE_ENABLED=1 in Netlify env (and clear LIVE_MARKETPLACE_COMING_SOON).',
    );
  }
  if (!(typeof parsed.error === 'string' && parsed.error.trim()) && bodyPreview) {
    parsed.error = apiFailureErrorMessage(res, null, bodyPreview);
  }
  throw new LiveHostApiError(endpoint, res.status, parsed);
}

async function hostFetchJson<T>(
  endpoint: string,
  accessToken: string,
  init?: RequestInit,
): Promise<{ res: Response; json: T; bodyPreview: string }> {
  const res = await hostFetch(endpoint, accessToken, init);
  const bodyPreview = await readWebApiResponseText(res);
  const parsed = parseWebApiJsonBody<LiveHostApiErrorBody & T>(bodyPreview);
  const json = (parsed ?? {}) as T;
  logVaultCommandCenter('api_response', {
    endpoint,
    status: res.status,
    ok: res.ok,
    code: parseApiBody(json).code ?? null,
    error: parseApiBody(json).error?.slice(0, 160) ?? null,
    bodyPreview: bodyPreview.slice(0, 120),
  });
  return { res, json, bodyPreview };
}

async function hostFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  return fetchWebApiMobileWithSellerAuth(path, accessToken, init);
}

export async function fetchLiveRoomForHost(
  accessToken: string,
  roomId: string,
): Promise<LiveRoomHostDetail> {
  const endpoint = `/api/live-rooms/${encodeURIComponent(roomId)}`;
  const { res, json: j, bodyPreview } = await hostFetchJson<{ room?: LiveRoomHostDetail; error?: string; code?: string }>(
    endpoint,
    accessToken,
  );
  if (!res.ok) throwHostApiError(endpoint, res, j, bodyPreview);
  if (!j.room?.id) throw new Error('Room not found.');
  const room = j.room;
  return {
    id: room.id,
    title: room.title,
    status: room.status,
    roomType: room.roomType,
    description: room.description ?? null,
    showNotes: room.showNotes ?? null,
    scheduledStartAt: room.scheduledStartAt ?? null,
    startedAt: room.startedAt ?? null,
    endedAt: room.endedAt ?? null,
  };
}

export async function fetchSellerLiveReadiness(accessToken: string): Promise<SellerLiveReadiness> {
  const sessionSub = supabaseJwtSub(accessToken);
  const res = await hostFetch('/api/seller/live-readiness', accessToken);
  const rawText = await res.text();
  let j: SellerLiveReadiness & { error?: string; code?: string } = { canGoLive: false, issues: [] };
  if (rawText) {
    try {
      j = JSON.parse(rawText) as typeof j;
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    logVaultCommandCenter('live_readiness_failed', {
      status: res.status,
      code: j.code ?? null,
      error: j.error ?? null,
      bodyPreview: rawText.slice(0, 400),
      sessionSub,
    });
    throw new Error(apiErrorMessage(res, j.error ? j : rawText));
  }
  const sellerUserId =
    typeof (j as { sellerUserId?: string }).sellerUserId === 'string'
      ? (j as { sellerUserId: string }).sellerUserId
      : undefined;
  logVaultCommandCenter('live_readiness_ok', {
    status: res.status,
    canGoLive: j.canGoLive,
    sessionSub,
    sellerId: sellerUserId ?? null,
    userId: sellerUserId ?? null,
    sessionSellerMismatch: Boolean(sessionSub && sellerUserId && sessionSub !== sellerUserId),
  });
  if (__DEV__ || process.env.EXPO_PUBLIC_LIVE_FETCH_DEBUG === '1') {
    console.log('[live-readiness] ok', {
      canGoLive: j.canGoLive,
      sellerUserId: sellerUserId ?? null,
      sessionSub,
      mismatch: Boolean(sessionSub && sellerUserId && sessionSub !== sellerUserId),
    });
  }
  return {
    canGoLive: Boolean(j.canGoLive),
    issues: Array.isArray(j.issues) ? j.issues : [],
    checks: j.checks,
    sellerUserId,
  };
}

export async function patchLiveRoomAction(
  accessToken: string,
  roomId: string,
  action: 'start' | 'end' | 'cancel',
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

/** Seller in-room show notes (stored as live room `showNotes`, max 4000). */
export async function patchLiveRoomShowNotes(
  accessToken: string,
  roomId: string,
  showNotes: string,
): Promise<void> {
  const res = await hostFetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ showNotes }),
  });
  let j: { error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
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

export function hostConsoleRoomToDetail(room: HostConsoleRoom): LiveRoomHostDetail {
  return {
    id: room.id,
    title: room.title,
    status: room.status,
    roomType: room.roomType,
    description: room.description ?? null,
    showNotes: room.showNotes ?? null,
    scheduledStartAt: room.scheduledStartAt ?? null,
    startedAt: room.startedAt ?? null,
    endedAt: room.endedAt ?? null,
  };
}

export type HostConsoleMessage = {
  id: string;
  senderId?: string;
  senderUsername: string;
  body: string;
  messageType?: 'chat' | 'bid' | 'purchase' | 'system';
  createdAt: string;
};

export type HostRecentSaleRow = {
  id: string;
  kind: 'order' | 'break_spot' | 'variant_purchase';
  buyerUsername: string;
  amountUsd: number;
  paymentTone: 'paid' | 'retry' | 'pending';
  statusLabel: string;
  occurredAt: string;
  spotLabel?: string | null;
};

export type HostPaymentFailureRow = {
  id: string;
  kind: string;
  buyerId: string;
  buyerUsername: string | null;
  amountUsd: number;
  status: 'payment_failed' | 'recovery_pending';
  failureReason: string | null;
  failedAt: string;
  itemTitle: string | null;
};

function parseRecentSaleRow(raw: unknown): HostRecentSaleRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;
  const kindRaw = o.kind;
  const kind =
    kindRaw === 'order' || kindRaw === 'break_spot' || kindRaw === 'variant_purchase' ? kindRaw : 'order';
  const buyerUsername = typeof o.buyerUsername === 'string' ? o.buyerUsername.trim() : 'buyer';
  const amountUsd = typeof o.amountUsd === 'number' && Number.isFinite(o.amountUsd) ? o.amountUsd : 0;
  const toneRaw = o.paymentTone;
  const paymentTone = toneRaw === 'paid' || toneRaw === 'retry' || toneRaw === 'pending' ? toneRaw : 'pending';
  const statusLabel = typeof o.statusLabel === 'string' ? o.statusLabel : paymentTone;
  const occurredAt = typeof o.occurredAt === 'string' ? o.occurredAt : new Date().toISOString();
  const spotLabel = typeof o.spotLabel === 'string' ? o.spotLabel : null;
  return { id, kind, buyerUsername, amountUsd, paymentTone, statusLabel, occurredAt, spotLabel };
}

function parsePaymentFailureRow(raw: unknown): HostPaymentFailureRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const buyerId = typeof o.buyerId === 'string' ? o.buyerId.trim() : '';
  if (!id || !buyerId) return null;
  return {
    id,
    kind: typeof o.kind === 'string' ? o.kind : 'auction_win',
    buyerId,
    buyerUsername: typeof o.buyerUsername === 'string' ? o.buyerUsername : null,
    amountUsd: typeof o.amountUsd === 'number' && Number.isFinite(o.amountUsd) ? o.amountUsd : 0,
    status: o.status === 'recovery_pending' ? 'recovery_pending' : 'payment_failed',
    failureReason: typeof o.failureReason === 'string' ? o.failureReason : null,
    failedAt: typeof o.failedAt === 'string' ? o.failedAt : new Date().toISOString(),
    itemTitle: typeof o.itemTitle === 'string' ? o.itemTitle : null,
  };
}

export type HostConsolePayload = {
  serverNowMs: number;
  syncScope?: 'lite' | 'full';
  room: HostConsoleRoom;
  items: LiveRoomItemRow[];
  activeItem: LiveRoomItemRow | null;
  recentSalesTotalUsd: number;
  recentSales: HostRecentSaleRow[];
  paymentFailures: HostPaymentFailureRow[];
  messages: HostConsoleMessage[];
  giveaways: LiveGiveawayRow[];
};

export async function fetchHostConsole(
  accessToken: string,
  roomId: string,
  options?: { force?: boolean; lite?: boolean },
): Promise<HostConsolePayload> {
  if (options?.lite) {
    return fetchHostConsoleFromApi(accessToken, roomId, { lite: true });
  }
  return readThroughHostConsoleCache(
    accessToken,
    roomId,
    () => fetchHostConsoleFromApi(accessToken, roomId, { lite: false }),
    options,
  );
}

async function fetchHostConsoleFromApi(
  accessToken: string,
  roomId: string,
  options?: { lite?: boolean },
): Promise<HostConsolePayload> {
  const lite = options?.lite === true;
  const endpoint = `/api/live-rooms/${encodeURIComponent(roomId)}/host-console${lite ? '?lite=1' : ''}`;
  const { res, json: j, bodyPreview } = await hostFetchJson<{
    serverNowMs?: number;
    syncScope?: 'lite' | 'full';
    room?: HostConsoleRoom & { viewerCount?: number };
    queueItems?: { item: LiveRoomItemRow }[];
    messages?: HostConsoleMessage[];
    recentSales?: unknown[];
    sellerUnresolvedPaymentFailures?: unknown[];
    giveaways?: LiveGiveawayRow[];
    error?: string;
    code?: string;
    detail?: string;
  }>(endpoint, accessToken);
  if (!res.ok) throwHostApiError(endpoint, res, j, bodyPreview);
  if (!j.room?.id) throw new Error('Host console unavailable.');
  logVaultCommandCenter('host_console_ok', {
    roomId: j.room.id,
    queueCount: (j.queueItems ?? []).length,
    messageCount: (j.messages ?? []).length,
  });
  const items = (j.queueItems ?? []).map((q) => q.item).filter(Boolean);
  const activeItem = items.find((i) => i.status === 'active') ?? null;
  const recentSales = (j.recentSales ?? [])
    .map(parseRecentSaleRow)
    .filter((r): r is HostRecentSaleRow => r != null);
  const recentSalesTotalUsd = recentSales.reduce((sum, s) => sum + s.amountUsd, 0);
  const paymentFailures = (j.sellerUnresolvedPaymentFailures ?? [])
    .map(parsePaymentFailureRow)
    .filter((r): r is HostPaymentFailureRow => r != null);
  const messages = Array.isArray(j.messages) ? j.messages : [];
  const giveaways = Array.isArray(j.giveaways) ? j.giveaways : [];
  return {
    serverNowMs: j.serverNowMs ?? Date.now(),
    syncScope: j.syncScope ?? (lite ? 'lite' : 'full'),
    room: { ...j.room, viewerCount: j.room.viewerCount ?? 0 },
    items,
    activeItem,
    recentSalesTotalUsd,
    recentSales,
    paymentFailures,
    messages,
    giveaways,
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

export async function patchLiveRoomStreamPaused(
  accessToken: string,
  roomId: string,
  streamPaused: boolean,
): Promise<void> {
  const res = await hostFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/stream-settings`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify({ streamPaused }) },
  );
  let j: { error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}
