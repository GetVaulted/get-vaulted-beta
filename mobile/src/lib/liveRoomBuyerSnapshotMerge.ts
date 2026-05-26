import { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import type { RoomBroadcastPayload } from './realtimeChannels';

/** Optimistic merge for `bid_placed` on the active lot snapshot. */
export function mergeBuyerSnapshotForBidPlaced(
  snap: LiveRoomBuyerSnapshot,
  payload: RoomBroadcastPayload,
  wallNowMs: number,
): LiveRoomBuyerSnapshot | null {
  if (!payload.itemId || typeof payload.amountUsd !== 'number') return null;
  if (snap.activeItemId && snap.activeItemId !== payload.itemId) return null;

  const prevHigh = snap.currentBidUsd ?? 0;
  const nextHigh = Math.max(prevHigh, payload.amountUsd);
  const auctionEndsAt =
    payload.auctionEndsAt !== undefined ? payload.auctionEndsAt : snap.auctionEndsAt;
  const biddingOpen =
    typeof payload.biddingOpen === 'boolean' ? payload.biddingOpen : snap.biddingOpen;
  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: 'active',
      biddingOpen,
      auctionEndsAt,
    },
    wallNowMs,
  );

  return {
    ...snap,
    activeItemId: payload.itemId,
    currentBidUsd: nextHigh,
    minNextBidUsd: liveAuctionMinBidUsd({
      currentBidUsd: nextHigh,
      lastHighBidderId: payload.leadingBidderId ?? 'bidder',
    }),
    lastHighBidderUsername:
      payload.leadingBidderUsername !== undefined ? payload.leadingBidderUsername : snap.lastHighBidderUsername,
    lastHighBidderId:
      payload.leadingBidderId !== undefined ? payload.leadingBidderId : snap.lastHighBidderId,
    auctionEndsAt,
    biddingOpen: lotBidPhase === 'bidding_open',
    lotBidPhase,
    fetchedAtMs: wallNowMs,
  };
}
