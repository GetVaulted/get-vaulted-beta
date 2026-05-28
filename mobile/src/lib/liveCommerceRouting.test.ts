import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import type { LiveStream } from '../types';
import { isLiveBidCommerceUi, mustUseLiveBidFlow } from './liveCommerceRouting';

function stream(overrides: Partial<LiveStream> = {}): LiveStream {
  return {
    id: 'room-1',
    title: 'Room',
    category: 'cards',
    viewers: 1,
    roomStatus: 'live',
    scheduledStartAtIso: null,
    previewImageUrl: '',
    thumbnailGradient: ['#000', '#111'],
    host: { id: 'h1', name: 'Host', handle: '@host', avatarUrl: '', verified: false, followers: '1' },
    currentItem: '',
    startingBid: 1,
    currentBid: 1,
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
    pinnedProductLabel: '',
    giveawayLine: '',
    packStatusLine: '',
    ...overrides,
  };
}

describe('mustUseLiveBidFlow', () => {
  it('true when snapshot has activeItemId on break room', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      activeItemId: 'item-1',
    } as LiveRoomBuyerSnapshot;
    expect(mustUseLiveBidFlow(stream({ liveRoomFormat: 'break' }), snap)).toBe(true);
  });

  it('true when bid HUD shows before snapshot hydrates', () => {
    expect(
      mustUseLiveBidFlow(stream({ pinnedProductLabel: 'Lot A' }), null, {
        bottomRightLabel: 'Bid $1.00',
        bottomRightIsSlide: true,
      }),
    ).toBe(true);
  });

  it('false for break waiting state without lot metadata', () => {
    expect(mustUseLiveBidFlow(stream({ liveRoomFormat: 'break' }), null, { bottomRightLabel: 'Claim Team' })).toBe(
      false,
    );
  });

  it('false when active item is variant/team break spot selection', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemSalesFormat: 'team_break',
      activeItemVariants: [{ id: 'v1', label: 'AFC East', priceUsd: 35, quantityRemaining: 1, soldCount: 0, isHot: false, status: 'available', buyerUsername: null }],
    } as LiveRoomBuyerSnapshot;
    expect(mustUseLiveBidFlow(stream(), snap)).toBe(false);
  });
});

describe('isLiveBidCommerceUi', () => {
  it('detects slide and bid labels', () => {
    expect(isLiveBidCommerceUi({ bottomRightIsSlide: true })).toBe(true);
    expect(isLiveBidCommerceUi({ bottomRightLabel: 'Bid $2.00' })).toBe(true);
    expect(isLiveBidCommerceUi({ bottomRightLabel: 'Claim Team' })).toBe(false);
  });
});
