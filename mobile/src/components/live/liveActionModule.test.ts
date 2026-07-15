import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../../api/liveRoomBuyerRepository';
import type { LiveStream } from '../../types';
import {
  formatBidMoney,
  resolveBuyerRoomKind,
  resolveLiveBuyerCommerceHud,
  resolveLiveCommerceHud,
  resolveLiveRoomFormat,
  shouldShowBreakTeamControls,
} from './liveActionModule';

function baseStream(overrides: Partial<LiveStream> = {}): LiveStream {
  return {
    id: 'room-1',
    title: 'Test room',
    category: 'cards',
    viewers: 10,
    roomStatus: 'live',
    scheduledStartAtIso: null,
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

  it('treats sale API room as auction lane (not break)', () => {
    const snap = { roomType: 'sale' } as LiveRoomBuyerSnapshot;
    expect(resolveBuyerRoomKind(snap, baseStream({ liveRoomFormat: 'hybrid' }))).toBe('auction');
  });

  it('uses auction lane when break room has active auction lot', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      activeItemId: 'item-1',
    } as LiveRoomBuyerSnapshot;
    expect(resolveBuyerRoomKind(snap, baseStream({ liveRoomFormat: 'break' }))).toBe('auction');
  });

  it('keeps break lane when PYD/PYT spot board is on screen', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      activeItemId: 'item-1',
      activeItemSalesFormat: 'team_break',
      activeItemVariants: [
        {
          id: 'v1',
          label: 'AFC East',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          sortOrder: 0,
          status: 'available',
          buyerUsername: null,
        },
      ],
    } as LiveRoomBuyerSnapshot;
    expect(resolveBuyerRoomKind(snap, baseStream({ liveRoomFormat: 'break' }))).toBe('break');
  });

  it('defaults hybrid stream without focus to auction', () => {
    expect(resolveBuyerRoomKind(null, baseStream({ liveRoomFormat: 'hybrid' }))).toBe('auction');
  });
});

describe('shouldShowBreakTeamControls', () => {
  it('is false during filling (waiting for host / items first)', () => {
    expect(
      shouldShowBreakTeamControls({
        roomType: 'break',
        status: 'live',
        breakPhase: 'filling',
      } as LiveRoomBuyerSnapshot),
    ).toBe(false);
  });

  it('is true when break is in progress and no lot on screen', () => {
    expect(
      shouldShowBreakTeamControls({
        roomType: 'break',
        status: 'live',
        breakPhase: 'in_progress',
        activeItemId: null,
      } as LiveRoomBuyerSnapshot),
    ).toBe(true);
  });
});

describe('resolveLiveBuyerCommerceHud', () => {
  it('shows break controls only when break is actively in progress', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      breakPhase: 'in_progress',
      activeItemId: null,
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomLeftLabel).toBe('Join Break');
    expect(hud.bottomRightLabel).toBe('Claim Team');
  });

  it('shows waiting for live break room in filling phase (no lot yet)', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      breakPhase: 'filling',
      activeItemId: null,
      lotBidPhase: 'inactive',
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream({ liveRoomFormat: 'break' }), snap);
    expect(hud.bottomRightLabel).toBe('Waiting for Item');
    expect(hud.bottomLeftLabel).toBe('Custom');
    expect(hud.stateLine).not.toMatch(/spots left/i);
  });

  it('does not show break controls before break room snapshot loads', () => {
    const hud = resolveLiveBuyerCommerceHud(baseStream({ liveRoomFormat: 'break' }), null);
    expect(hud.bottomRightLabel).toBe('Waiting for Item');
    expect(hud.bottomLeftLabel).toBe('Custom');
  });

  it('shows waiting state when auction room has no active lot', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: null,
      lotBidPhase: 'inactive',
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Waiting for Item');
    expect(hud.bottomLeftLabel).toBe('Custom');
    expect(hud.bottomRightLabel).not.toBe('Claim Team');
    expect(hud.buyerPrimaryDisabled).toBe(true);
    expect(hud.buyerSecondaryDisabled).toBe(true);
  });

  it('shows Custom + Bid when bidding is open', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: 'item-1',
      lotBidPhase: 'bidding_open',
      currentBidUsd: 50,
      minNextBidUsd: 52,
      auctionEndsAt: new Date(Date.now() + 15000).toISOString(),
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomLeftLabel).toBe('Custom');
    expect(hud.bottomRightLabel).toBe('Hold to Bid $52.00');
    expect(hud.bottomRightIsSlide).toBe(false);
    expect(hud.buyerPrimaryDisabled).toBe(false);
  });

  it('shows bid preview (disabled) when lot is active but bidding not started', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: 'item-1',
      lotBidPhase: 'not_started',
      currentBidUsd: 0,
      minNextBidUsd: 1,
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Hold to Bid $1.00');
    expect(hud.buyerPrimaryDisabled).toBe(true);
  });

  it('uses auction bid flow when break room has active lot', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      breakPhase: 'filling',
      activeItemId: 'item-1',
      lotBidPhase: 'bidding_open',
      currentBidUsd: 10,
      minNextBidUsd: 11,
      auctionEndsAt: new Date(Date.now() + 15000).toISOString(),
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream({ liveRoomFormat: 'break' }), snap);
    expect(hud.bottomRightLabel).toBe('Hold to Bid $11.00');
    expect(hud.bottomRightLabel).not.toBe('Claim Team');
  });

  it('legacy stream without format no longer maps to Join Break', () => {
    const hud = resolveLiveCommerceHud(baseStream());
    expect(hud.bottomRightLabel).not.toBe('Claim Team');
  });

  it('shows Buy Now for sale room with linked listing', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemListingId: 'listing-1',
      activeItemSalesFormat: 'buy_now',
      priceUsd: 125,
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Buy Now $125.00');
    expect(hud.currentPrefix).toBe('Price');
    expect(hud.buyerPrimaryDisabled).toBe(false);
  });

  it('shows auction bid CTA for sale-room auction lot (not Buy Now)', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'Raw Lot',
      activeItemSalesFormat: 'auction',
      biddingOpen: true,
      lotBidPhase: 'bidding_open',
      auctionEndsAt: new Date(Date.now() + 30_000).toISOString(),
      startingBidUsd: 5,
      currentBidUsd: 5,
      minNextBidUsd: 6,
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toMatch(/bid/i);
    expect(hud.bottomRightLabel).not.toMatch(/buy now/i);
    expect(hud.buyerPrimaryDisabled).toBe(false);
  });

  it('shows Claim Division CTA when PYD break is pinned without host spot pin', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'PYD 1 Box Break',
      activeItemSalesFormat: 'team_break',
      activeItemVariants: [
        {
          id: 'v1',
          label: 'AFC East',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Claim Division');
    expect(hud.itemTitle).toBe('PYD 1 Box Break');
    expect(hud.buyerPrimaryDisabled).toBe(false);
    expect(hud.buyerPinnedVariantId).toBeUndefined();
  });

  it('shows spot auction bid CTA when host pinned spot is in timed auction', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'PYT 1 Box Break',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariantAssignmentMode: 'pick',
      activeSpotCommerceMode: 'auction',
      auctionVariantId: 'v1',
      biddingOpen: true,
      lotBidPhase: 'bidding_open',
      minNextBidUsd: 40,
      activeItemVariants: [
        {
          id: 'v1',
          label: 'Chiefs',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Hold to Bid $40.00');
    expect(hud.itemTitle).toBe('Chiefs');
    expect(hud.categoryType).toBe('PYT 1 Box Break');
    expect(hud.buyerPrimaryDisabled).toBe(false);
    expect(hud.buyerPinnedVariantId).toBe('v1');
  });

  it('shows auctioned team title even when isHot was cleared mid-auction', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'PYT 1 Box Break',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariantAssignmentMode: 'pick',
      activeSpotCommerceMode: 'auction',
      auctionVariantId: 'v1',
      biddingOpen: true,
      lotBidPhase: 'bidding_open',
      minNextBidUsd: 40,
      activeItemVariants: [
        {
          id: 'v1',
          label: 'Chiefs',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.itemTitle).toBe('Chiefs');
    expect(hud.categoryType).toBe('PYT 1 Box Break');
    expect(hud.stateLine).toContain('Chiefs auction live');
    expect(hud.buyerPinnedVariantId).toBe('v1');
    expect(hud.bottomRightLabel).toBe('Hold to Bid $40.00');
  });

  it('shows hybrid auction + shop when one team auctions and others remain buyable', () => {
    const snap = {
      roomType: 'sale',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'PYT 1 Box Break',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariantAssignmentMode: 'pick',
      activeSpotCommerceMode: 'auction',
      auctionVariantId: 'v1',
      biddingOpen: true,
      lotBidPhase: 'bidding_open',
      minNextBidUsd: 40,
      activeItemVariants: [
        {
          id: 'v1',
          label: 'Chiefs',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: 'available',
          buyerUsername: null,
        },
        {
          id: 'v2',
          label: 'Bills',
          priceUsd: 35,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Hold to Bid $40.00');
    expect(hud.showShopButton).toBe(true);
    expect(hud.shopButtonLabel).toBe('Claim Team');
    expect(hud.itemTitle).toBe('Chiefs');
    expect(hud.stateLine).toContain('other team');
  });

  it('shows pinned team checkout HUD when host pins a PYT spot for fixed buy', () => {
    const snap = {
      roomType: 'break',
      status: 'live',
      activeItemId: 'item-1',
      activeItemTitle: 'PYT 1 Box Break',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariantAssignmentMode: 'pick',
      activeItemVariants: [
        {
          id: 'v1',
          label: 'Chiefs',
          priceUsd: 40,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: 'available',
          buyerUsername: null,
        },
        {
          id: 'v2',
          label: 'Bills',
          priceUsd: 40,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.itemTitle).toBe('Chiefs');
    expect(hud.bottomRightLabel).toBe('Pick Your Team');
    expect(hud.buyerPinnedVariantId).toBe('v1');
    expect(hud.showShopButton).toBe(true);
    expect(hud.stateLine).toContain('shipping & tax');
  });

  it('shows Claim Team when PYT break is pinned without host spot pin', () => {
    const snap = {
      roomType: 'auction',
      status: 'live',
      activeItemId: 'item-2',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariants: [
        {
          id: 'v2',
          label: 'Ravens',
          priceUsd: 24.99,
          quantityRemaining: 3,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
        },
      ],
      fetchedAtMs: Date.now(),
    } as LiveRoomBuyerSnapshot;
    const hud = resolveLiveBuyerCommerceHud(baseStream(), snap);
    expect(hud.bottomRightLabel).toBe('Claim Team');
    expect(hud.buyerPrimaryDisabled).toBe(false);
  });
});

describe('formatBidMoney', () => {
  it('formats two decimal places', () => {
    expect(formatBidMoney(1)).toBe('$1.00');
  });
});
