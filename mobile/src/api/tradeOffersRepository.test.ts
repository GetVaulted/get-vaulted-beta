import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebMarketplaceListing } from './webListingsTypes';

const fetchPublishedListingsFromWeb = vi.fn();

vi.mock('./webListingsRepository', () => ({
  fetchPublishedListingsFromWeb: (...args: unknown[]) => fetchPublishedListingsFromWeb(...args),
  fetchMyListingsFromWeb: vi.fn(),
  fetchListingsByIdsFromWeb: vi.fn(),
  createListingViaWeb: vi.fn(),
  getListingsAccessToken: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  getSupabase: vi.fn(() => null),
}));

import { fetchLiveListingsExcludingSeller, resolvePublishedListingSellerId } from './tradeOffersRepository';

function listing(overrides: Partial<WebMarketplaceListing> & { id: string; sellerId: string }): WebMarketplaceListing {
  return {
    title: 'Item',
    price: 10,
    imageSeed: 'seed',
    sellerUsername: 'seller',
    sellerVerified: true,
    category: 'Other',
    buyingFormat: 'buy_now',
    condition: 'Good',
    listedAt: '2026-01-01T00:00:00.000Z',
    href: `/listing/${overrides.id}`,
    listingStatus: 'active',
    acceptTradeOffers: true,
    ...overrides,
  };
}

describe('fetchLiveListingsExcludingSeller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rows: WebMarketplaceListing[] = [
    listing({ id: 'l-viewer', sellerId: 'viewer' }),
    listing({ id: 'l-seller-a-1', sellerId: 'seller-a' }),
    listing({ id: 'l-seller-a-2', sellerId: 'seller-a' }),
    listing({ id: 'l-seller-b-1', sellerId: 'seller-b' }),
    listing({ id: 'l-not-tradeable', sellerId: 'seller-a', acceptTradeOffers: false }),
    listing({ id: 'l-ended', sellerId: 'seller-a', listingStatus: 'ended' }),
  ];

  it('excludes the viewer but returns tradeable listings from every other seller when no target seller is given', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue(rows);
    const result = await fetchLiveListingsExcludingSeller('viewer');
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['l-seller-a-1', 'l-seller-a-2', 'l-seller-b-1']);
  });

  it('scopes results to only the target seller when targetSellerId is provided (prevents leaking other sellers)', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue(rows);
    const result = await fetchLiveListingsExcludingSeller('viewer', 'seller-a');
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['l-seller-a-1', 'l-seller-a-2']);
    expect(ids).not.toContain('l-seller-b-1');
  });

  it('still excludes the viewer even if the viewer is mistakenly passed as the target seller', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue(rows);
    const result = await fetchLiveListingsExcludingSeller('viewer', 'viewer');
    expect(result).toEqual([]);
  });

  it('respects trade-eligibility and status filters even when scoped to a target seller', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue(rows);
    const result = await fetchLiveListingsExcludingSeller('viewer', 'seller-a');
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain('l-not-tradeable');
    expect(ids).not.toContain('l-ended');
  });
});

describe('resolvePublishedListingSellerId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the sellerId for a known listing', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue([listing({ id: 'l-1', sellerId: 'seller-a' })]);
    await expect(resolvePublishedListingSellerId('l-1')).resolves.toBe('seller-a');
  });

  it('returns null for an unknown listing', async () => {
    fetchPublishedListingsFromWeb.mockResolvedValue([listing({ id: 'l-1', sellerId: 'seller-a' })]);
    await expect(resolvePublishedListingSellerId('does-not-exist')).resolves.toBeNull();
  });
});
