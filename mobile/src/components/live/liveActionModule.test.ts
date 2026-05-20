import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../../api/liveRoomBuyerRepository';
import type { LiveStream } from '../../types';
import {
  resolveBuyerRoomKind,
  resolveLiveBuyerCommerceHud,
  resolveLiveCommerceHud,
  resolveLiveRoomFormat,
} from './liveActionModule';

function baseStream(overrides: Partial<LiveStream> = {}): LiveStream {
  return {
    id: 'room-1',
    title: 'Test room',
    category: 'cards',
    viewers: 10,
    previewImageUrl: 'https://example.com/x.jpg',
    thumbnailGradient: ['#000', '#111'],
    host: { id: 'h1', name: 'Host', handle: '@host', avatarUrl: 'https://example.com/a.jpg', verified: false, followers: '1k' },
    currentItem: 'Lot A',
    startingBid: 5,
    currentBid: 25,
    reserve: 0,
    buyNowPrice: null,
    timeLeftSeconds: 30,
    chat: [],
    recentBids: [],
    highlightsCount: 0,
    showDescription: '',
    categoryTags: [],
    engagementLine: '',
    discoveryTags: [],
    breakProgress: 0,
    pinnedProductLabel: 'Pinned lot',
    giveawayLine: '',
    packStatusLine: '',
    ...overrides,
  };
}

describe('resolveLiveRoomFormat', () => {
  it('defaults unknown streams to auction (not break)', () => {
    expect(resolveLiveRoomFormat(baseStream())).toBe('auction');
  });
});

describe('resolveBuyerRoomKind', () => {
  it('uses API roomType break over stale stream format', () => {
    const snap = { roomType: 'break' } as LiveRoomBuyerSnapshot;
    expect(resolveBuyerRoomKind(snap, baseStream({ liveRoomFormat: 'auction' }))).toBe('break');
  });

  it('treats auction API room as auction even without stream format', () => {
    const snap = { roomType: 'auction' } as LiveRoomBuyerSnapshot;
    expect(resolveBuyerRoomKind(snap, baseStream())).toBe('auction');
  });
});

describe('resolveLiveBuyerCommerceHud', () => {
  it('shows break controls only for break rooms', () => {
    const snap = { roomType: 'break', status: 'live' } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomLeftLabel).toBe('Join Break');
    expect(hud.bottomRightLabel).toBe('Claim Team');
  });

  it('shows vault waiting copy when auction room has no active lot', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: null,
      lotBidPhase: 'inactive',
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).not.toBe('Claim Team');
    expect(hud.stateLine).toContain('host is setting the next lot');
    expect(hud.buyerPrimaryDisabled).toBe(true);
  });

  it('shows bid controls when bidding is open', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: 'item-1',
      lotBidPhase: 'bidding_open',
      currentBidUsd: 50,
      minNextBidUsd: 75,
      auctionEndsAt: new Date(Date.now() + 15000).toISOString(),
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toContain('Bid $');
    expect(hud.bottomRightIsSlide).toBe(true);
    expect(hud.buyerPrimaryDisabled).toBe(false);
  });

  it('legacy stream without format no longer maps to Join Break', () => {
    const hud = resolveLiveCommerceHud(baseStream());
    expect(hud.bottomRightLabel).not.toBe('Claim Team');
  });
});
