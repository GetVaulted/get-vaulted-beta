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

async function fetchLiveRoomsApi(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    return await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes('Network request failed') || e instanceof TypeError
        ? `Could not reach the Vaulted API at ${base}. Check your connection and env.`
        : msg,
    );
  }
}

export function streamFormatToRoomType(format: 'auction' | 'break' | 'hybrid'): LiveRoomApiRow['roomType'] {
  if (format === 'break') return 'break';
  if (format === 'auction') return 'auction';
  return 'sale';
}

export type CreateLiveRoomInput = {
  title: string;
  description?: string;
  category: string;
  roomType: LiveRoomApiRow['roomType'];
  scheduledStartAt?: string | null;
  teamBoardLeague?: 'nba' | 'nfl' | 'mlb';
};

export async function createLiveRoom(
  accessToken: string,
  input: CreateLiveRoomInput,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    category: input.category.trim() || 'Sports Cards',
    roomType: input.roomType,
  };
  if (input.scheduledStartAt) {
    body.scheduledStartAt = input.scheduledStartAt;
  }
  if (input.roomType === 'break') {
    body.teamBoardLeague = input.teamBoardLeague ?? 'nba';
  }

  const res = await fetchLiveRoomsApi('/api/live-rooms', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  let j: { id?: string; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.id) throw new Error('Server did not return a room id.');
  return { id: j.id };
}

export async function fetchLiveRoomsPublic(limit = 80): Promise<LiveRoomApiRow[]> {
  const res = await fetchLiveRoomsApi(`/api/live-rooms?limit=${limit}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { rooms?: LiveRoomApiRow[] };
  return Array.isArray(j.rooms) ? j.rooms : [];
}

export async function fetchMyLiveRooms(accessToken: string): Promise<LiveRoomApiRow[]> {
  const res = await fetchLiveRoomsApi('/api/live-rooms?mine=1&includeEnded=1&limit=40', {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    let j: unknown;
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(apiErrorMessage(res, j));
  }
  const j = (await res.json()) as { rooms?: LiveRoomApiRow[] };
  return Array.isArray(j.rooms) ? j.rooms : [];
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
  return 'hybrid';
}

export function liveRoomRowToLiveStream(row: LiveRoomApiRow): LiveStream {
  const cat = mapListingCategoryToCategoryId(row.category);
  const categoryTags = liveRoomCategoryTagsForRow(row.category, cat);
  return {
    id: row.id,
    title: row.title,
    category: cat,
    viewers: Math.max(0, row.viewerCount ?? 0),
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
    hybridFocus: 'auction',
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
