import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import { applyBuyerSnapshotPurchaseCompleted, recomputeBuyerSnapshotPhase } from './liveBuyerSnapshotClock';

function snap(overrides: Partial<LiveRoomBuyerSnapshot> = {}): LiveRoomBuyerSnapshot {
  return {
    roomId: 'room-1',
    status: 'live',
    roomType: 'auction',
    activeItemId: 'item-1',
    biddingOpen: true,
    currentBidUsd: 10,
    minNextBidUsd: 11,
    auctionEndsAt: new Date(Date.now() + 5000).toISOString(),
    lotBidPhase: 'bidding_open',
    fetchedAtMs: Date.now(),
    ...overrides,
  };
}

describe('liveBuyerSnapshotClock', () => {
  it('recomputes phase when server end time passes', () => {
    const ends = new Date(Date.now() - 5000).toISOString();
    const next = recomputeBuyerSnapshotPhase(
      snap({ auctionEndsAt: ends, biddingOpen: true, lotBidPhase: 'bidding_open' }),
      Date.now(),
    );
    expect(next.lotBidPhase).toBe('timer_ended_unsettled');
    expect(next.biddingOpen).toBe(false);
  });

  it('stops timer immediately on purchase_completed but keeps lot until sold out is explicit', () => {
    const next = applyBuyerSnapshotPurchaseCompleted(snap(), 'item-1', Date.now());
    expect(next.lotBidPhase).toBe('settled');
    expect(next.auctionEndsAt).toBeNull();
    expect(next.biddingOpen).toBe(false);
    expect(next.activeItemId).toBe('item-1');
  });

  it('clears pinned lot only when itemSoldOut is true', () => {
    const next = applyBuyerSnapshotPurchaseCompleted(snap(), 'item-1', Date.now(), {
      itemSoldOut: true,
    });
    expect(next.activeItemId).toBeNull();
    expect(next.lotBidPhase).toBe('settled');
  });

  it('keeps lot ready after multi-qty no-bid round', () => {
    const next = applyBuyerSnapshotPurchaseCompleted(snap(), 'item-1', Date.now(), {
      noBids: true,
      itemSoldOut: false,
    });
    expect(next.lotBidPhase).toBe('not_started');
    expect(next.activeItemId).toBe('item-1');
    expect(next.currentBidUsd).toBeNull();
  });

  // Regression: a no-bid round must not advance the lot's unit number on the buyer's screen.
  // The realtime merge only resets bid state — it must leave `activeItemTitle` (e.g. "Break 1 #15")
  // exactly as the server last sent it, so the buyer keeps seeing #15 until the unit actually sells.
  it('keeps the lot unit number (#15) unchanged through a no-bid round', () => {
    const next = applyBuyerSnapshotPurchaseCompleted(
      snap({ activeItemTitle: 'Break 1 #15' }),
      'item-1',
      Date.now(),
      { noBids: true, itemSoldOut: false },
    );
    expect(next.activeItemTitle).toBe('Break 1 #15');
    expect(next.activeItemId).toBe('item-1');
  });
});
