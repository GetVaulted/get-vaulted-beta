import {
  buildCreateLiveRoomPayload,
  type BreakPricingMode,
  type CreateScheduleMode,
  type TeamBoardLeague,
} from '../lib/createLiveRoomPayload';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { logVaultCommandCenter, supabaseJwtSub } from '../lib/logVaultCommandCenterFlow';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { liveRoomCategoryTagsForRow } from '../lib/liveRoomDisplay';
import { mapListingCategoryToCategoryId } from './listingsFeedRepository';
import type { CategoryId, Host, LiveStream, ScheduledStream } from '../types';

export type LiveRoomApiRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  roomType: 'auction' | 'sale' | 'break';
  status: 'scheduled' | 'live' | 'ended';
  thumbnailUrl: string;
  viewerCount: number;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  sellerUsername: string;
  itemCount: number;
  activeItemTitle: string | null;
};

const FALLBACK_PREVIEW =
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&q=78&auto=format&fit=crop';

function parseApiErrorBody(raw: unknown): {
  json: { error?: string; code?: string; detail?: string } | null;
  text: string;
} {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { json: null, text: '' };
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string; detail?: string };
      return { json: parsed, text };
    } catch {
      return { json: null, text: text.slice(0, 240) };
    }
  }
  if (raw && typeof raw === 'object') {
    return { json: raw as { error?: string; code?: string; detail?: string }, text: '' };
  }
  return { json: null, text: '' };
}

function apiErrorMessage(res: Response, body: unknown, apiBase?: string): string {
  const status = res.status;
  const { json: o, text: rawText } = parseApiErrorBody(body);
  const code = o?.code;
  const detail = o?.detail?.trim();
  const errText = o?.error?.trim();
  const htmlHint =
    rawText && /password|visitor|forbidden|access denied|netlify/i.test(rawText)
      ? ' Edge/WAF or Netlify visitor gate returned HTML — open beta in Safari once, or set EXPO_PUBLIC_BETA_HTTP_BASIC if deploy password is enabled.'
      : '';

  if (code === "LIVE_COMING_SOON" || status === 503) {
    return (
      errText ??
      'Live is disabled on this server. Use https://beta.shopgetvaulted.com or set LIVE_MARKETPLACE_ENABLED=1 on the API host.'
    );
  }
  if (code === "LIVE_ROOMS_LIST_FAILED" || status === 500) {
    if (detail?.includes("EMAXCONNSESSION") || detail?.includes("max clients reached")) {
      return (
        errText ??
        "Live rooms temporarily unavailable (database connection pool busy). Pull to refresh in a moment."
      );
    }
    return (
      errText ??
      `Live rooms API error (500)${detail ? `: ${detail}` : ''}. Check Netlify function logs for Prisma/DB issues.`
    );
  }
  if (code === 'LIVE_NOT_READY') {
    return errText ?? 'Complete seller setup before creating a live room.';
  }
  if (status === 403) {
    if (errText) return errText;
    const host = apiBase ?? 'API host';
    if (rawText && !o) {
      return `Forbidden (403) from ${host}.${htmlHint} The server did not return JSON — check edge/WAF or sign in again.`;
    }
    return (
      `Forbidden (403) from ${host}.${htmlHint} If this persists, sign out and back in, or check Netlify visitor/WAF rules.`
    );
  }
  if (status === 404) {
    return (
      errText ??
      `Not found (404) at ${apiBase ?? 'API'}/api/live-rooms — wrong EXPO_PUBLIC_SITE_URL or API not deployed on this host.`
    );
  }
  if (errText) return errText;
  return `Request failed (${status})`;
}

async function fetchLiveRoomsApi(path: string, init: RequestInit): Promise<Response> {
  return fetchWebApiMobile(path, init);
}

export function streamFormatToRoomType(format: 'auction' | 'break' | 'hybrid'): LiveRoomApiRow['roomType'] {
  if (format === 'break') return 'break';
  if (format === 'auction') return 'auction';
  return 'sale';
}

export type CreateLiveRoomInput = {
  title: string;
  description?: string;
  category?: string;
  roomType: LiveRoomApiRow['roomType'];
  scheduleMode: CreateScheduleMode;
  scheduledStartAt?: string | null;
  thumbnailUrl?: string | null;
  teamBoardLeague?: TeamBoardLeague;
  breakTotalSpots?: string | number;
  breakPricingMode?: BreakPricingMode;
  breakSpotPrice?: string | number;
  teamSelectionBoardEnabled?: boolean;
  tipModeratorId?: string | null;
  tipsToModerator?: boolean;
};

export async function createLiveRoom(
  accessToken: string,
  input: CreateLiveRoomInput,
  logContext?: { sellerUserId?: string | null },
): Promise<{ id: string }> {
  const body = buildCreateLiveRoomPayload({
    ...input,
    category: input.category?.trim() || 'Other',
  });
  const sessionSub = supabaseJwtSub(accessToken);
  const sellerId = logContext?.sellerUserId ?? sessionSub;
  const apiBase = getWebApiBaseUrl();
  logVaultCommandCenter('room_create_request', {
    status: 'pending',
    sessionSub,
    sellerId,
    userId: sellerId,
    sessionSellerMismatch: Boolean(
      sessionSub && logContext?.sellerUserId && sessionSub !== logContext.sellerUserId,
    ),
    roomType: input.roomType,
    scheduleMode: input.scheduleMode,
    apiBase,
  });

  const res = await fetchLiveRoomsApi('/api/live-rooms', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let j: { id?: string; error?: string; code?: string; issues?: string[]; detail?: string } = {};
  if (rawText) {
    try {
      j = JSON.parse(rawText) as typeof j;
    } catch {
      j = {};
    }
  }

  if (!res.ok) {
    const msg = apiErrorMessage(res, rawText || j, apiBase ?? undefined);
    const issues =
      Array.isArray(j.issues) && j.issues.length > 0 ? j.issues.join(' · ') : undefined;
    const fullMsg = issues && !msg.includes(issues) ? `${msg}\n\n${issues}` : msg;
    const serverSellerId =
      typeof (j as { sellerUserId?: string }).sellerUserId === 'string'
        ? (j as { sellerUserId: string }).sellerUserId
        : null;
    const resolvedSellerId = serverSellerId ?? sellerId;
    logVaultCommandCenter('room_create_failed', {
      status: res.status,
      code: j.code ?? null,
      error: j.error ?? null,
      detail: j.detail?.slice(0, 200) ?? null,
      bodyPreview: rawText.slice(0, 400),
      sessionSub,
      sellerId: resolvedSellerId,
      userId: resolvedSellerId,
      sessionSellerMismatch: Boolean(
        sessionSub && resolvedSellerId && sessionSub !== resolvedSellerId,
      ),
    });
    if (__DEV__ || process.env.EXPO_PUBLIC_LIVE_FETCH_DEBUG === '1') {
      console.warn('[live-rooms] POST failed', {
        status: res.status,
        code: j.code ?? null,
        error: j.error ?? null,
        sessionSub,
        sellerId: resolvedSellerId,
        body: rawText.slice(0, 500),
      });
    }
    throw new Error(fullMsg);
  }
  if (!j.id) {
    logVaultCommandCenter('room_create_failed', {
      status: res.status,
      code: 'NO_ROOM_ID',
      bodyPreview: rawText.slice(0, 400),
      sessionSub,
      sellerIdHint: sessionSub,
    });
    throw new Error('Server did not return a room id.');
  }
  logVaultCommandCenter('room_create_ok', {
    roomId: j.id,
    status: res.status,
    sessionSub,
    sellerId,
    userId: sellerId,
  });
  return { id: j.id };
}

export async function fetchLiveRoomsPublic(limit = 80): Promise<LiveRoomApiRow[]> {
  const base = getWebApiBaseUrl();
  const path = `/api/live-rooms?limit=${limit}`;
  const res = await fetchLiveRoomsApi(path, {
    method: 'GET',
  });
  const rawText = await res.text();
  const logLiveFetch = __DEV__ || process.env.EXPO_PUBLIC_LIVE_FETCH_DEBUG === '1';
  if (logLiveFetch) {
    console.log('[liveRooms] GET', `${base}${path}`, 'status', res.status, 'body', rawText.slice(0, 500));
  }
  let j: { rooms?: LiveRoomApiRow[]; error?: string; code?: string; detail?: string } = {};
  if (rawText) {
    try {
      j = JSON.parse(rawText) as typeof j;
      if (logLiveFetch) {
        console.log('[liveRooms] parsed', {
          roomCount: Array.isArray(j.rooms) ? j.rooms.length : null,
          code: j.code ?? null,
          error: j.error ?? null,
          detail: j.detail?.slice(0, 160) ?? null,
        });
      }
    } catch (parseErr) {
      if (logLiveFetch) {
        console.warn('[liveRooms] JSON parse failed', parseErr instanceof Error ? parseErr.message : parseErr);
      }
      if (!res.ok) throw new Error(apiErrorMessage(res, rawText, base ?? undefined));
    }
  }
  if (!res.ok) {
    if (logLiveFetch) {
      console.warn('[liveRooms] request failed', res.status, j.error ?? rawText.slice(0, 200));
    }
    throw new Error(apiErrorMessage(res, j.rooms ? j : rawText, base ?? undefined));
  }
  return Array.isArray(j.rooms) ? j.rooms : [];
}

/** Public room detail for deep links (scheduled or live) when not in the directory list. */
export async function fetchLiveRoomPublicById(roomId: string): Promise<LiveRoomApiRow | null> {
  const res = await fetchLiveRoomsApi(`/api/live-rooms/${encodeURIComponent(roomId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  let j: {
    room?: {
      id?: string;
      title?: string;
      description?: string | null;
      category?: string;
      roomType?: LiveRoomApiRow['roomType'];
      status?: LiveRoomApiRow['status'];
      thumbnailUrl?: string;
      viewerCount?: number;
      scheduledStartAt?: string | null;
      startedAt?: string | null;
      endedAt?: string | null;
      sellerUsername?: string;
      itemCount?: number;
      activeItem?: { title?: string; displayTitle?: string } | null;
    };
    error?: string;
  } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok || !j.room?.id) return null;
  const r = j.room;
  return {
    id: r.id!,
    title: r.title ?? 'Live show',
    description: r.description ?? null,
    category: r.category ?? 'Other',
    roomType: r.roomType ?? 'auction',
    status: r.status ?? 'scheduled',
    thumbnailUrl: r.thumbnailUrl ?? '',
    viewerCount: r.viewerCount ?? 0,
    scheduledStartAt: r.scheduledStartAt ?? null,
    startedAt: r.startedAt ?? null,
    endedAt: r.endedAt ?? null,
    sellerUsername: r.sellerUsername ?? 'host',
    itemCount: r.itemCount ?? 0,
    activeItemTitle: (r.activeItem?.displayTitle?.trim() || r.activeItem?.title) ?? null,
  };
}

export async function fetchMyLiveRooms(accessToken: string): Promise<LiveRoomApiRow[]> {
  const path = '/api/live-rooms?mine=1&includeEnded=1&limit=40';
  const res = await fetchLiveRoomsApi(path, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const logFetch = __DEV__ || process.env.EXPO_PUBLIC_VAULT_EVENTS_DEBUG === '1';
  if (!res.ok) {
    let j: unknown;
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    if (logFetch) {
      console.warn('[vault-events-filter] GET mine failed', { status: res.status, path });
    }
    throw new Error(apiErrorMessage(res, j));
  }
  const j = (await res.json()) as { rooms?: LiveRoomApiRow[] };
  const rooms = Array.isArray(j.rooms) ? j.rooms : [];
  if (logFetch) {
    console.info(
      '[vault-events-filter]',
      JSON.stringify({
        http: 'ok',
        status: res.status,
        roomCount: rooms.length,
        statuses: rooms.map((r) => r.status),
      }),
    );
  }
  return rooms;
}

function hostFromRow(row: LiveRoomApiRow): Host {
  const uname = row.sellerUsername?.trim() || 'host';
  return {
    id: uname,
    name: uname,
    handle: `@${uname}`,
    avatarUrl:
      'https://images.unsplash.com/photo-1517649763962-0c62306601b7?w=200&q=80&auto=format&fit=crop',
    verified: false,
    followers: '—',
  };
}

function fmtSchedule(iso: string | null): string {
  if (!iso) return 'Schedule TBA';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Schedule TBA';
  }
}

function liveRoomFormatFromType(roomType: LiveRoomApiRow['roomType']): LiveStream['liveRoomFormat'] {
  if (roomType === 'break') return 'break';
  if (roomType === 'auction') return 'auction';
  if (roomType === 'sale') return 'shop';
  return 'auction';
}

export function liveRoomRowToLiveStream(row: LiveRoomApiRow): LiveStream {
  const cat = mapListingCategoryToCategoryId(row.category);
  const categoryTags = liveRoomCategoryTagsForRow(row.category, cat);
  return {
    id: row.id,
    title: row.title,
    category: cat,
    viewers: Math.max(0, row.viewerCount ?? 0),
    roomStatus: row.status,
    scheduledStartAtIso: row.scheduledStartAt,
    previewImageUrl: row.thumbnailUrl?.trim() || FALLBACK_PREVIEW,
    thumbnailGradient: ['#05070a', '#0c1018'] as [string, string],
    host: hostFromRow(row),
    currentItem: row.activeItemTitle?.trim() || 'Live',
    startingBid: 0,
    currentBid: 0,
    reserve: 0,
    buyNowPrice: null,
    timeLeftSeconds: 0,
    chat: [],
    recentBids: [],
    highlightsCount: 0,
    showDescription: row.description?.trim() || 'Live on Get Vaulted.',
    categoryTags,
    engagementLine: '',
    discoveryTags: categoryTags,
    breakProgress: 0,
    pinnedProductLabel: 'Live show',
    giveawayLine: '',
    packStatusLine: '',
    liveRoomFormat: liveRoomFormatFromType(row.roomType),
    hybridFocus: row.roomType === 'break' ? 'break' : 'auction',
  };
}

export function liveRoomRowToScheduledStream(row: LiveRoomApiRow): ScheduledStream {
  const cat = mapListingCategoryToCategoryId(row.category) as CategoryId;
  return {
    id: row.id,
    title: row.title,
    startsAt: fmtSchedule(row.scheduledStartAt),
    host: hostFromRow(row),
    category: cat,
    interestedCount: 0,
    cardGradient: ['#0a0c10', '#141a24'] as [string, string],
    eventTag: row.status === 'live' ? 'Live' : 'Scheduled',
  };
}

export function mapLiveRoomsToDiscovery(rows: LiveRoomApiRow[]): {
  live: LiveStream[];
  scheduled: ScheduledStream[];
} {
  const live: LiveStream[] = [];
  const scheduled: ScheduledStream[] = [];
  for (const r of rows) {
    if (r.status === 'live') live.push(liveRoomRowToLiveStream(r));
    else if (r.status === 'scheduled') scheduled.push(liveRoomRowToScheduledStream(r));
  }
  return { live, scheduled };
}
