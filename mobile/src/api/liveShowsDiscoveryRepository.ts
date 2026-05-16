import { getSupabase } from '../lib/supabase';
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
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&q=78&auto=format&fit=crop';

function profileToHost(id: string, p?: ProfileRow): Host {
  const name = p?.display_name?.trim() || p?.username?.trim() || 'Host';
  const handle = p?.username?.trim() ? `@${p.username.trim()}` : '@host';
  return {
    id,
    name,
    handle,
    avatarUrl:
      p?.avatar_url?.trim() ||
      'https://images.unsplash.com/photo-1517649763962-0c62306601b7?w=200&q=80&auto=format&fit=crop',
    verified: p?.verified_status === 'verified',
    followers: '—',
  };
}

function categoryLabel(cat: CategoryId): string {
  switch (cat) {
    case 'cards':
      return 'Cards';
    case 'sneakers':
      return 'Sneakers';
    case 'watches':
      return 'Watches';
    case 'memorabilia':
      return 'Memorabilia';
    case 'other':
      return 'Other';
    default:
      return 'Luxury';
  }
}

function tagsForCategory(cat: CategoryId, raw: string | null): string[] {
  const base = [categoryLabel(cat)];
  if (raw && !base.includes(raw)) base.push(raw);
  return base;
}

function showToLiveStream(row: ShowRow, host?: ProfileRow): LiveStream {
  const cat = mapListingCategoryToCategoryId(row.category);
  const tags = tagsForCategory(cat, row.category);
  const hostVm = profileToHost(row.host_id, host);
  const emptyChat: ChatMessage[] = [];
  const emptyBids: Bid[] = [];
  return {
    id: row.id,
    title: row.title,
    category: cat,
    viewers: Math.max(0, row.viewer_count ?? 0),
    previewImageUrl: row.thumbnail_url?.trim() || FALLBACK_PREVIEW,
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
    engagementLine: 'Live now',
    discoveryTags: tags,
    breakProgress: 0,
    pinnedProductLabel: 'Live show',
    giveawayLine: '',
    packStatusLine: '',
    liveRoomFormat: 'hybrid',
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
  return {
    id: row.id,
    title: row.title,
    startsAt: fmtSchedule(row.scheduled_start),
    host: profileToHost(row.host_id, host),
    category: cat,
    interestedCount: 0,
    cardGradient: ['#0a0c10', '#141a24'] as [string, string],
    eventTag: 'Scheduled',
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

export async function fetchLiveShowsForDiscovery(): Promise<{ live: LiveStream[]; scheduled: ScheduledStream[] }> {
  try {
    const { fetchLiveRoomsPublic, mapLiveRoomsToDiscovery } = await import('./liveRoomsRepository');
    const rows = await fetchLiveRoomsPublic(80);
    if (rows.length > 0) {
      return mapLiveRoomsToDiscovery(rows);
    }
  } catch (e) {
    console.warn('fetchLiveShowsForDiscovery api', e instanceof Error ? e.message : e);
  }

  const sb = getSupabase();
  if (!sb) return { live: [], scheduled: [] };
  const { data, error } = await sb
    .from('live_shows_public')
    .select('id, host_id, title, description, category, thumbnail_url, status, viewer_count, scheduled_start')
    .in('status', ['live', 'scheduled'])
    .order('updated_at', { ascending: false })
    .limit(40);
  if (error || !data?.length) {
    if (error) console.warn('fetchLiveShowsForDiscovery', error.message);
    return { live: [], scheduled: [] };
  }
  const rows = data as ShowRow[];
  const hostIds = rows.map((r) => r.host_id);
  const profiles = await fetchProfilesMap(sb, hostIds);
  const live: LiveStream[] = [];
  const scheduled: ScheduledStream[] = [];
  for (const r of rows) {
    if (r.status === 'live') live.push(showToLiveStream(r, profiles.get(r.host_id)));
    else scheduled.push(showToScheduledStream(r, profiles.get(r.host_id)));
  }
  return { live, scheduled };
}
