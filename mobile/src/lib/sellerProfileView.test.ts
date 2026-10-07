import { describe, expect, it } from 'vitest';
import {
  buildTrustRows,
  formatMemberSince,
  profileLinkDisplay,
  profileLiteFromShopSeller,
  profileShowCard,
  reviewSummaryLabel,
  safeProfileLinkUrl,
  type ProfileShow,
  type ProfileShows,
} from './sellerProfileView';

const show = (id: string, status: ProfileShow['status'], over: Partial<ProfileShow> = {}): ProfileShow => ({
  id,
  title: `Show ${id}`,
  category: 'Cards',
  status,
  thumbnailUrl: null,
  scheduledStartAt: null,
  startedAt: null,
  endedAt: null,
  ...over,
});

const empty: ProfileShows = { liveNow: null, nextShow: null, lastLive: null, recent: [], totalShows: 0 };

describe('safeProfileLinkUrl', () => {
  it('allows http(s) urls with a host', () => {
    expect(safeProfileLinkUrl('https://instagram.com/mnmheat')).toBe('https://instagram.com/mnmheat');
  });
  it('rejects other schemes, hostless and junk values', () => {
    expect(safeProfileLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeProfileLinkUrl('https://localhost')).toBeNull();
    expect(safeProfileLinkUrl('mailto:a@b.com')).toBeNull();
    expect(safeProfileLinkUrl('')).toBeNull();
    expect(safeProfileLinkUrl(null)).toBeNull();
  });
});

describe('profileLinkDisplay', () => {
  it('shows handles for networks and bare host for websites', () => {
    expect(profileLinkDisplay({ key: 'instagram', url: 'https://instagram.com/mnmheat' })).toBe('@mnmheat');
    expect(profileLinkDisplay({ key: 'tiktok', url: 'https://www.tiktok.com/@mnm.heat' })).toBe('@mnm.heat');
    expect(profileLinkDisplay({ key: 'x', url: 'https://x.com/mnmheat' })).toBe('@mnmheat');
    expect(profileLinkDisplay({ key: 'youtube', url: 'https://www.youtube.com/@mnmheat' })).toBe('@mnmheat');
    expect(profileLinkDisplay({ key: 'website', url: 'https://www.mnmheat.com/shop' })).toBe('mnmheat.com');
  });
});

describe('profileShowCard', () => {
  it('returns null with no shows', () => {
    expect(profileShowCard(null)).toBeNull();
    expect(profileShowCard(empty)).toBeNull();
  });
  it('prefers live, then next, then last live', () => {
    const live = show('a', 'live');
    const next = show('b', 'scheduled', { scheduledStartAt: '2026-10-10T20:00:00' });
    const last = show('c', 'ended', { endedAt: '2026-10-05T22:00:00' });
    expect(profileShowCard({ ...empty, liveNow: live, nextShow: next, lastLive: last })).toMatchObject({
      isLive: true,
      kicker: 'Live now',
    });
    expect(profileShowCard({ ...empty, nextShow: next, lastLive: last })).toMatchObject({
      isLive: false,
      kicker: 'Next show · Oct 10, 8:00 PM',
    });
    expect(profileShowCard({ ...empty, lastLive: last })).toMatchObject({ kicker: 'Last live · Oct 5' });
  });
});

describe('trust rows', () => {
  it('formats the member-since month', () => {
    expect(formatMemberSince('2026-08-15T12:00:00')).toBe('Aug 2026');
    expect(formatMemberSince(null)).toBe('');
  });
  it('lists the four credentials', () => {
    const rows = buildTrustRows({
      sellerLevel: 'vault_seller',
      sellerLevelLabel: 'Vault Seller',
      sellerLevelDescription: 'x',
      ordersCompleted: 1234,
      memberSince: '2026-08-15T12:00:00',
      emailVerified: false,
    });
    expect(rows).toEqual([
      { label: 'Seller level', value: 'Vault Seller' },
      { label: 'Items sold', value: '1,234' },
      { label: 'Member since', value: 'Aug 2026' },
      { label: 'Email', value: 'Not verified' },
    ]);
  });
});

describe('reviews in the trust card', () => {
  it('labels the summary', () => {
    expect(reviewSummaryLabel(null)).toBe('None yet');
    expect(reviewSummaryLabel({ count: 0, average: null })).toBe('None yet');
    expect(reviewSummaryLabel({ count: 1234, average: 4.8 })).toBe('4.8 ★ (1,234)');
  });
  it('adds the reviews row only when reviews are provided', () => {
    const trust = {
      sellerLevel: 'vault_seller',
      sellerLevelLabel: 'Vault Seller',
      sellerLevelDescription: 'x',
      ordersCompleted: 2,
      memberSince: '2026-08-15T12:00:00',
      emailVerified: true,
    };
    expect(buildTrustRows(trust)).toHaveLength(4);
    expect(buildTrustRows(trust, { count: 3, average: 5 }).at(-1)).toEqual({ label: 'Buyer reviews', value: '5.0 ★ (3)' });
  });
});

describe('profileLiteFromShopSeller', () => {
  it('builds a profile card from the shop seller when the profiles row is missing', () => {
    expect(
      profileLiteFromShopSeller('store-id', { username: ' bigdawgbreakers ', name: null, image: 'https://x/a.jpg' }),
    ).toEqual({
      id: 'store-id',
      username: 'bigdawgbreakers',
      display_name: 'bigdawgbreakers',
      avatar_url: 'https://x/a.jpg',
    });
  });

  it('returns null when there is no usable seller', () => {
    expect(profileLiteFromShopSeller('id', null)).toBeNull();
    expect(profileLiteFromShopSeller('id', { username: '  ' })).toBeNull();
  });
});
