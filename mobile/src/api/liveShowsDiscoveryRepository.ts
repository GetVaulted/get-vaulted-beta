import { setLiveDiscoveryMeta } from '../lib/liveDiscoveryMeta';
import { getSupabase } from '../lib/supabase';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { liveRoomCategoryTagsForRow } from '../lib/liveRoomDisplay';
import { resolveLiveRoomPreviewImage, assertLivePreviewResolvable } from '../lib/liveRoomPreviewImage';
import { mapListingCategoryToCategoryId } from './listingsFeedRepository';
import type { Bid, CategoryId, ChatMessage, Host, LiveStream, ScheduledStream } from '../types';

type ShowRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  status: string;
  viewer_count: number | null;
  scheduled_start: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified_status: string | null;
};

const FALLBACK_PREVIEW =
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=1500&q=80&auto=format&fit=crop';

function profileToHost(id: string, p?: ProfileRow): Host {
  const name = p?.display_name?.trim() || p?.username?.trim() || 'Host';
  const handle = p?.username?.trim() ? `@${p.username.trim()}` : '@host';
  return {
    id,
    name,
    handle,
    avatarUrl: p?.avatar_url?.trim() || '',
    verified: p?.verified_status === 'verified',
    followers: '—',
  };
}

function mapRoomStatus(status: string): LiveStream['roomStatus'] {
  if (status === 'live') return 'live';
  if (status === 'ended') return 'ended';
  return 'scheduled';
}

function showToLiveStream(row: ShowRow, host?: ProfileRow): LiveStream {
  const cat = mapListingCategoryToCategoryId(row.category);
  const tags = liveRoomCategoryTagsForRow(row.category, cat);
  const hostVm = profileToHost(row.host_id, host);
  const emptyChat: ChatMessage[] = [];
  const emptyBids: Bid[] = [];
  assertLivePreviewResolvable(row.thumbnail_url);
  const previewImageUrl = resolveLiveRoomPreviewImage({
    thumbnailUrl: row.thumbnail_url,
    category: cat,
  });
  return {
    id: row.id,
    title: row.title,
    category: cat,
    viewers: Math.max(0, row.viewer_count ?? 0),
    roomStatus: mapRoomStatus(row.status),
    scheduledStartAtIso: row.scheduled_start,
    previewImageUrl: previewImageUrl || FALLBACK_PREVIEW,
    thumbnailGradient: ['#05070a', '#0c1018'] as [string, string],
    host: hostVm,
    currentItem: 'Live',
    startingBid: 0,
    currentBid: 0,
    reserve: 0,
    buyNowPrice: null,
    timeLeftSeconds: 0,
    chat: emptyChat,
    recentBids: emptyBids,
    highlightsCount: 0,
    showDescription: row.description?.trim() || 'Show notes will appear when the host publishes them.',
    categoryTags: tags,
    engagementLine: '',
    discoveryTags: tags,
    breakProgress: 0,
    pinnedProductLabel: 'Live show',
    giveawayLine: '',
    packStatusLine: '',
    liveRoomFormat: 'auction',
    hybridFocus: 'auction',
  };
}

function fmtSchedule(iso: string | null): string {
  if (!iso) return 'Schedule TBA';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
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

function showToScheduledStream(row: ShowRow, host?: ProfileRow): ScheduledStream {
  const cat = mapListingCategoryToCategoryId(row.category);
  const stream = showToLiveStream(row, host);
  return {
    id: row.id,
    title: row.title,
    startsAt: fmtSchedule(row.scheduled_start),
    host: profileToHost(row.host_id, host),
    category: cat,
    interestedCount: 0,
    cardGradient: ['#0a0c10', '#141a24'] as [string, string],
    eventTag: 'Scheduled',
    previewImageUrl: stream.previewImageUrl,
    scheduledStartAtIso: row.scheduled_start,
  };
}

async function fetchProfilesMap(sb: NonNullable<ReturnType<typeof getSupabase>>, ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map<string, ProfileRow>();
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url, verified_status').in('id', uniq);
  if (error || !data) return new Map();
  const m = new Map<string, ProfileRow>();
  for (const row of data as ProfileRow[]) {
    m.set(row.id, row);
  }
  return m;
}

export type LiveDiscoveryFetchResult = {
  live: LiveStream[];
  scheduled: ScheduledStream[];
  meta: {
    source: 'next_api' | 'supabase_fallback' | 'none';
    fetchedAt: number;
    apiBaseUrl: string | null;
    error: string | null;
    success: boolean;
  };
};

export async function fetchLiveShowsForDiscovery(): Promise<LiveDiscoveryFetchResult> {
  const apiBase = getWebApiBaseUrl();
  const fetchedAt = Date.now();

  if (apiBase) {
    try {
      const { fetchLiveRoomsPublic, mapLiveRoomsToDiscovery } = await import('./liveRoomsRepository');
      const rows = await fetchLiveRoomsPublic(80);
      const pack = mapLiveRoomsToDiscovery(rows);
      const meta = {
        source: 'next_api' as const,
        fetchedAt,
        apiBaseUrl: apiBase,
        error: null,
        success: true,
      };
      setLiveDiscoveryMeta(meta);
      return { ...pack, meta };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[fetchLiveShowsForDiscovery] API failed — no Supabase fallback when API base is set', {
        apiBase,
        error: msg,
      });
      const meta = {
        source: 'none' as const,
        fetchedAt,
        apiBaseUrl: apiBase,
        error: msg,
        success: false,
      };
      setLiveDiscoveryMeta(meta);
      return { live: [], scheduled: [], meta };
    }
  }

  const sb = getSupabase();
  if (!sb) {
    const meta = {
      source: 'none' as const,
      fetchedAt,
      apiBaseUrl: null,
      error: 'Set EXPO_PUBLIC_SITE_URL to your web API host.',
      success: false,
    };
    setLiveDiscoveryMeta(meta);
    return { live: [], scheduled: [], meta };
  }
  const { data, error } = await sb
    .from('live_shows_public')
    .select('id, host_id, title, description, category, thumbnail_url, status, viewer_count, scheduled_start')
    .in('status', ['live', 'scheduled'])
    .order('updated_at', { ascending: false })
    .limit(40);
  if (error || !data?.length) {
    if (error) console.warn('fetchLiveShowsForDiscovery', error.message);
    const meta = {
      source: 'supabase_fallback' as const,
      fetchedAt,
      apiBaseUrl: null,
      error: error?.message ?? 'No rows in live_shows_public',
      success: false,
    };
    setLiveDiscoveryMeta(meta);
    return { live: [], scheduled: [], meta };
  }
  const rows = data as ShowRow[];
  const hostIds = rows.map((r) => r.host_id);
  const profiles = await fetchProfilesMap(sb, hostIds);
  const live: LiveStream[] = [];
  const scheduled: ScheduledStream[] = [];
  for (const r of rows) {
    if (r.status === 'live') live.push(showToLiveStream(r, profiles.get(r.host_id)));
    else if (r.status === 'scheduled' && r.scheduled_start) {
      scheduled.push(showToScheduledStream(r, profiles.get(r.host_id)));
    }
  }
  const meta = {
    source: 'supabase_fallback' as const,
    fetchedAt,
    apiBaseUrl: null,
    error: null,
    success: true,
  };
  setLiveDiscoveryMeta(meta);
  return { live, scheduled, meta };
}

/** Public live + scheduled shows for a host profile. */
export async function fetchLiveShowsByHostId(
  hostId: string,
): Promise<{ live: LiveStream[]; scheduled: ScheduledStream[]; ended: LiveStream[] }> {
  const sb = getSupabase();
  const ended: LiveStream[] = [];
  if (!sb) return { live: [], scheduled: [], ended };
  const { data, error } = await sb
    .from('live_shows_public')
    .select('id, host_id, title, description, category, thumbnail_url, status, viewer_count, scheduled_start')
    .eq('host_id', hostId)
    .order('updated_at', { ascending: false })
    .limit(24);
  if (error || !data?.length) return { live: [], scheduled: [], ended };
  const rows = data as ShowRow[];
  const profiles = await fetchProfilesMap(sb, [hostId]);
  const host = profiles.get(hostId);
  const live: LiveStream[] = [];
  const scheduled: ScheduledStream[] = [];
  for (const r of rows) {
    if (r.status === 'live') live.push(showToLiveStream(r, host));
    else if (r.status === 'scheduled' && r.scheduled_start) {
      scheduled.push(showToScheduledStream(r, host));
    }
    else ended.push(showToLiveStream(r, host));
  }
  return { live, scheduled, ended };
}
