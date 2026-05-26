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

  it('stops timer immediately on purchase_completed', () => {
    const next = applyBuyerSnapshotPurchaseCompleted(snap(), 'item-1', Date.now());
    expect(next.lotBidPhase).toBe('settled');
    expect(next.auctionEndsAt).toBeNull();
    expect(next.biddingOpen).toBe(false);
  });
});
