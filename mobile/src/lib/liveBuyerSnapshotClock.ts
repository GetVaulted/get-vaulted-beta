import { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';

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

/** Server purchase_completed — stop timer; reset bid state for next unit or clear lot when sold out. */
export function applyBuyerSnapshotPurchaseCompleted(
  snap: LiveRoomBuyerSnapshot,
  itemId: string | undefined,
  nowMs: number,
  opts?: { noBids?: boolean; itemSoldOut?: boolean },
): LiveRoomBuyerSnapshot {
  if (!itemId || snap.activeItemId !== itemId) {
    return { ...snap, fetchedAtMs: nowMs };
  }

  const resetBids = {
    currentBidUsd: null as number | null,
    minNextBidUsd: liveAuctionMinBidUsd({
      currentBidUsd: null,
      startingBidUsd: snap.startingBidUsd,
      priceUsd: snap.priceUsd,
      lastHighBidderId: null,
    }),
    lastHighBidderId: null as string | null,
    lastHighBidderUsername: null as string | null,
    biddingOpen: false,
    auctionEndsAt: null as string | null,
    fetchedAtMs: nowMs,
  };

  if (opts?.noBids === true) {
    if (opts?.itemSoldOut === false) {
      return {
        ...snap,
        ...resetBids,
        lotBidPhase: 'not_started',
      };
    }
    return {
      ...snap,
      ...resetBids,
      activeItemId: null,
      lotBidPhase: 'settled',
    };
  }

  if (opts?.itemSoldOut === false) {
    return {
      ...snap,
      ...resetBids,
      lotBidPhase: 'not_started',
    };
  }

  return {
    ...snap,
    ...resetBids,
    activeItemId: null,
    lotBidPhase: 'settled',
  };
}
