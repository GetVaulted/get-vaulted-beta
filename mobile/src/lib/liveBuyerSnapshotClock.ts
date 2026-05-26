import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';

/** Recompute lot phase from server auctionEndsAt + synced wall clock (never extend past server close). */
export function recomputeBuyerSnapshotPhase(
  snap: LiveRoomBuyerSnapshot,
  nowMs: number,
): LiveRoomBuyerSnapshot {
  if (snap.lotBidPhase === 'settled') return snap;

  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: 'active',
      biddingOpen: snap.biddingOpen,
      auctionEndsAt: snap.auctionEndsAt,
    },
    nowMs,
  );

  return {
    ...snap,
    lotBidPhase,
    biddingOpen: lotBidPhase === 'bidding_open',
    fetchedAtMs: nowMs,
  };
}

/** Server purchase_completed / sold — local timer must stop immediately. */
export function applyBuyerSnapshotPurchaseCompleted(
  snap: LiveRoomBuyerSnapshot,
  itemId: string | undefined,
  nowMs: number,
): LiveRoomBuyerSnapshot {
  if (!itemId || snap.activeItemId !== itemId) {
    return { ...snap, fetchedAtMs: nowMs };
  }
  return {
    ...snap,
    lotBidPhase: 'settled',
    biddingOpen: false,
    auctionEndsAt: null,
    fetchedAtMs: nowMs,
  };
}
