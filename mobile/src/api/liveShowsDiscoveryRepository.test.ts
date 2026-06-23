import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/webApiBaseUrl', () => ({
  getWebApiBaseUrl: vi.fn(() => 'https://beta.shopgetvaulted.com'),
}));

vi.mock('../lib/supabase', () => ({
  getSupabase: vi.fn(() => null),
}));

const fetchLiveRoomsPublic = vi.fn();

vi.mock('./liveRoomsRepository', () => ({
  fetchLiveRoomsPublic: (...args: unknown[]) => fetchLiveRoomsPublic(...args),
  mapLiveRoomsToDiscovery: (rows: { id: string; status: string; title: string; category: string; roomType: string; thumbnailUrl: string; viewerCount: number; scheduledStartAt: string | null; startedAt: string | null; endedAt: string | null; sellerUsername: string; itemCount: number; activeItemTitle: string | null }[]) => {
    const live = rows.filter((r) => r.status === 'live').map((r) => ({ id: r.id, title: r.title }));
    const scheduled = rows.filter((r) => r.status === 'scheduled').map((r) => ({ id: r.id, title: r.title }));
    return { live, scheduled };
  },
}));

import { fetchLiveShowsForDiscovery } from './liveShowsDiscoveryRepository';

describe('fetchLiveShowsForDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses beta API directory even when empty (no Supabase fallback)', async () => {
    fetchLiveRoomsPublic.mockResolvedValue([]);
    const pack = await fetchLiveShowsForDiscovery();
    expect(fetchLiveRoomsPublic).toHaveBeenCalledWith(80);
    expect(pack.live).toEqual([]);
    expect(pack.scheduled).toEqual([]);
    expect(pack.meta.source).toBe('next_api');
    expect(pack.meta.success).toBe(true);
  });

  it('maps scheduled and live from API rows', async () => {
    fetchLiveRoomsPublic.mockResolvedValue([
      {
        id: 'live-1',
        title: 'Live show',
        status: 'live',
        category: 'Other',
        roomType: 'auction',
        thumbnailUrl: '',
        viewerCount: 0,
        scheduledStartAt: null,
        startedAt: null,
        endedAt: null,
        sellerUsername: 'sellerqa',
        itemCount: 0,
        activeItemTitle: null,
        description: null,
      },
      {
        id: 'sched-1',
        title: 'Upcoming',
        status: 'scheduled',
        category: 'Other',
        roomType: 'auction',
        thumbnailUrl: '',
        viewerCount: 0,
        scheduledStartAt: '2026-05-21T18:00:00.000Z',
        startedAt: null,
        endedAt: null,
        sellerUsername: 'sellerqa',
        itemCount: 0,
        activeItemTitle: null,
        description: null,
      },
      {
        id: 'now-1',
        title: 'Go live now',
        status: 'scheduled',
        category: 'Other',
        roomType: 'auction',
        thumbnailUrl: '',
        viewerCount: 0,
        scheduledStartAt: null,
        startedAt: null,
        endedAt: null,
        sellerUsername: 'sellerqa',
        itemCount: 0,
        activeItemTitle: null,
        description: null,
      },
    ]);
    const pack = await fetchLiveShowsForDiscovery();
    expect(pack.live).toHaveLength(1);
    expect(pack.scheduled).toHaveLength(2);
  });
});
