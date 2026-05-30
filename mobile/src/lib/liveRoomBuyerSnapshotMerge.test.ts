import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import { reconcileBuyerSnapshotMonotonic } from './liveRoomBuyerSnapshotMerge';

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

  it('preserves the known high when the incoming snapshot drops currentBid to null', () => {
    const prev = snap({ currentBidUsd: 4 });
    const incoming = snap({ currentBidUsd: null, minNextBidUsd: null });
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
