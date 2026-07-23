import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import {
  mergeBuyerSnapshotForActiveItemChanged,
  mergeBuyerSnapshotForOptimisticBid,
  reconcileBuyerSnapshotMonotonic,
} from './liveRoomBuyerSnapshotMerge';

function snap(overrides: Partial<LiveRoomBuyerSnapshot> = {}): LiveRoomBuyerSnapshot {
  return {
    roomId: 'room-1',
    status: 'live',
    roomType: 'auction',
    activeItemId: 'item-1',
    biddingOpen: true,
    currentBidUsd: 4,
    minNextBidUsd: 5,
    auctionEndsAt: '2026-01-01T00:00:00.000Z',
    lotBidPhase: 'bidding_open',
    fetchedAtMs: 1_000,
    startingBidUsd: 1,
    priceUsd: null,
    lastHighBidderId: 'me',
    lastHighBidderUsername: 'me',
    ...overrides,
  };
}

describe('reconcileBuyerSnapshotMonotonic', () => {
  it('ignores a stale lower high bid for the same active lot', () => {
    const prev = snap({ currentBidUsd: 4, minNextBidUsd: 5 });
    const incomingStale = snap({ currentBidUsd: 3, minNextBidUsd: 4, fetchedAtMs: 2_000 });

    const r = reconcileBuyerSnapshotMonotonic(prev, incomingStale);

    expect(r.staleIgnored).toBe(true);
    expect(r.lotChanged).toBe(false);
    expect(r.snap.currentBidUsd).toBe(4);
    // next minimum bid derived from the preserved higher amount, not the stale $3
    expect(r.snap.minNextBidUsd).toBe(5);
  });

  it('accepts a higher high bid for the same lot and flags advance', () => {
    const prev = snap({ currentBidUsd: 4, minNextBidUsd: 5 });
    const incoming = snap({ currentBidUsd: 6, minNextBidUsd: 7 });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.staleIgnored).toBe(false);
    expect(r.advanced).toBe(true);
    expect(r.snap.currentBidUsd).toBe(6);
  });

  it('resets bid state when the active item changes', () => {
    const prev = snap({ activeItemId: 'item-1', currentBidUsd: 40 });
    const nextLot = snap({ activeItemId: 'item-2', currentBidUsd: 1, minNextBidUsd: 2 });

    const r = reconcileBuyerSnapshotMonotonic(prev, nextLot);

    expect(r.lotChanged).toBe(true);
    expect(r.staleIgnored).toBe(false);
    expect(r.snap.currentBidUsd).toBe(1);
  });

  it('resets when the room changes', () => {
    const prev = snap({ roomId: 'room-1', currentBidUsd: 40 });
    const nextRoom = snap({ roomId: 'room-2', currentBidUsd: 2 });

    const r = reconcileBuyerSnapshotMonotonic(prev, nextRoom);

    expect(r.lotChanged).toBe(true);
    expect(r.snap.currentBidUsd).toBe(2);
  });

  it('passes through when there is no prior snapshot', () => {
    const incoming = snap({ currentBidUsd: 3 });
    const r = reconcileBuyerSnapshotMonotonic(null, incoming);
    expect(r.snap).toBe(incoming);
    expect(r.staleIgnored).toBe(false);
    expect(r.lotChanged).toBe(false);
  });

  it('accepts a server-cleared round (null high + no bidder) after a prior win on the same lot', () => {
    const prev = snap({
      currentBidUsd: 2,
      minNextBidUsd: 3,
      lastHighBidderId: 'winner',
      lastHighBidderUsername: 'winner',
      biddingOpen: false,
      lotBidPhase: 'not_started',
      auctionEndsAt: null,
    });
    const incoming = snap({
      currentBidUsd: null,
      minNextBidUsd: 1,
      lastHighBidderId: null,
      lastHighBidderUsername: null,
      startingBidUsd: 1,
      biddingOpen: true,
      lotBidPhase: 'bidding_open',
      auctionEndsAt: '2026-01-01T00:01:00.000Z',
      fetchedAtMs: 2_000,
    });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.staleIgnored).toBe(false);
    expect(r.snap.currentBidUsd).toBeNull();
    expect(r.snap.lastHighBidderId).toBeNull();
    expect(r.snap.minNextBidUsd).toBe(1);
  });

  it('still preserves the known high when a stale poll drops currentBid but keeps a high bidder', () => {
    const prev = snap({ currentBidUsd: 4, lastHighBidderId: 'me' });
    const incoming = snap({
      currentBidUsd: null,
      minNextBidUsd: null,
      lastHighBidderId: 'me',
      fetchedAtMs: 2_000,
    });
    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);
    expect(r.staleIgnored).toBe(true);
    expect(r.snap.currentBidUsd).toBe(4);
  });

  it('preserves minNextBidUsd when high is unchanged but incoming min regresses', () => {
    const prev = snap({ currentBidUsd: 1, minNextBidUsd: 2, lastHighBidderId: 'me' });
    const incoming = snap({ currentBidUsd: 1, minNextBidUsd: 1, fetchedAtMs: 2_000 });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.staleIgnored).toBe(true);
    expect(r.snap.currentBidUsd).toBe(1);
    expect(r.snap.minNextBidUsd).toBe(2);
  });

  it('keeps the later auctionEndsAt when a stale poll has an earlier close time', () => {
    const prev = snap({
      auctionEndsAt: '2026-01-01T00:00:30.000Z',
      currentBidUsd: 5,
      minNextBidUsd: 6,
    });
    const incoming = snap({
      auctionEndsAt: '2026-01-01T00:00:15.000Z',
      currentBidUsd: 5,
      minNextBidUsd: 6,
      fetchedAtMs: 2_000,
    });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.snap.auctionEndsAt).toBe('2026-01-01T00:00:30.000Z');
  });

  it('accepts server active item when lot changes even if prev had a higher bid', () => {
    const prev = snap({
      activeItemId: 'item-old',
      currentBidUsd: 50,
      minNextBidUsd: 55,
      activeItemSalesFormat: 'auction',
    });
    const incoming = snap({
      activeItemId: 'item-new',
      activeItemSalesFormat: 'variant_selection',
      activeItemVariants: [
        {
          id: 'v1',
          label: 'AFC East',
          priceUsd: 25,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          sortOrder: 0,
          status: 'available',
          buyerUsername: null,
        },
      ],
      currentBidUsd: null,
      minNextBidUsd: null,
      fetchedAtMs: 2_000,
    });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.lotChanged).toBe(true);
    expect(r.snap.activeItemId).toBe('item-new');
    expect(r.snap.activeItemSalesFormat).toBe('variant_selection');
    expect(r.snap.currentBidUsd).toBeNull();
  });

  it('always applies server break phase on the same lot', () => {
    const prev = snap({
      breakPhase: 'filling',
      activeItemId: null,
      currentBidUsd: null,
      minNextBidUsd: null,
    });
    const incoming = snap({
      breakPhase: 'in_progress',
      activeItemId: null,
      currentBidUsd: null,
      minNextBidUsd: null,
      fetchedAtMs: 2_000,
    });

    const r = reconcileBuyerSnapshotMonotonic(prev, incoming);

    expect(r.snap.breakPhase).toBe('in_progress');
  });
});

describe('mergeBuyerSnapshotForActiveItemChanged', () => {
  it('clears prior-lot bid state when the host pins a new active item', () => {
    const prev = snap({
      activeItemId: 'item-won',
      currentBidUsd: 21,
      minNextBidUsd: 22,
      lastHighBidderId: 'buyer-1',
      lastHighBidderUsername: 'winner',
      startingBidUsd: 1,
    });

    const merged = mergeBuyerSnapshotForActiveItemChanged(
      prev,
      { itemId: 'item-next', biddingOpen: false, auctionEndsAt: null },
      5_000,
    );

    expect(merged?.activeItemId).toBe('item-next');
    expect(merged?.currentBidUsd).toBeNull();
    expect(merged?.lastHighBidderId).toBeNull();
    expect(merged?.minNextBidUsd).toBe(1);
  });

  it('updates timer fields on the same active lot', () => {
    const prev = snap({
      activeItemId: 'item-1',
      lotBidPhase: 'not_started',
      biddingOpen: false,
      auctionEndsAt: null,
      currentBidUsd: null,
      lastHighBidderId: null,
      minNextBidUsd: 1,
    });

    const merged = mergeBuyerSnapshotForActiveItemChanged(
      prev,
      {
        itemId: 'item-1',
        biddingOpen: true,
        auctionEndsAt: '2026-01-01T00:00:30.000Z',
      },
      Date.parse('2026-01-01T00:00:00.000Z'),
    );

    expect(merged?.activeItemId).toBe('item-1');
    expect(merged?.biddingOpen).toBe(true);
    expect(merged?.auctionEndsAt).toBe('2026-01-01T00:00:30.000Z');
  });

  it('clears prior-round bid state when bidding reopens on the same lot', () => {
    const prev = snap({
      activeItemId: 'item-1',
      currentBidUsd: 2,
      minNextBidUsd: 3,
      lastHighBidderId: 'winner',
      lastHighBidderUsername: 'winner',
      startingBidUsd: 1,
      biddingOpen: false,
      lotBidPhase: 'not_started',
      auctionEndsAt: null,
    });

    const merged = mergeBuyerSnapshotForActiveItemChanged(
      prev,
      {
        itemId: 'item-1',
        biddingOpen: true,
        auctionEndsAt: '2026-01-01T00:00:30.000Z',
      },
      Date.parse('2026-01-01T00:00:00.000Z'),
    );

    expect(merged?.currentBidUsd).toBeNull();
    expect(merged?.lastHighBidderId).toBeNull();
    expect(merged?.minNextBidUsd).toBe(1);
    expect(merged?.biddingOpen).toBe(true);
  });
});

describe('mergeBuyerSnapshotForOptimisticBid', () => {
  it('advances the high bid immediately for Hold-to-Bid', () => {
    const prev = snap({ currentBidUsd: 4, minNextBidUsd: 5 });
    const merged = mergeBuyerSnapshotForOptimisticBid(prev, {
      itemId: 'item-1',
      amountUsd: 5,
      wallNowMs: 2_000,
    });

    expect(merged?.currentBidUsd).toBe(5);
    expect(merged?.minNextBidUsd).toBeGreaterThan(5);
    expect(merged?.lotBidPhase).toBe('bidding_open');
  });

  it('marks the local viewer as leading bidder when provided', () => {
    const prev = snap({ currentBidUsd: 4, minNextBidUsd: 5, lastHighBidderId: 'other' });
    const merged = mergeBuyerSnapshotForOptimisticBid(prev, {
      itemId: 'item-1',
      amountUsd: 5,
      wallNowMs: 2_000,
      leadingBidderId: 'me',
      leadingBidderUsername: 'vaulted_me',
    });

    expect(merged?.lastHighBidderId).toBe('me');
    expect(merged?.lastHighBidderUsername).toBe('vaulted_me');
  });
});
