import { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';
import type { LiveRoomBuyerSnapshot, LiveBidHttpAck } from '../api/liveRoomBuyerRepository';
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

/** Merge bid HTTP ACK (server authoritative timer + high bid). */
export function mergeBuyerSnapshotForBidAck(
  snap: LiveRoomBuyerSnapshot,
  ack: LiveBidHttpAck,
  wallNowMs: number,
): LiveRoomBuyerSnapshot | null {
  const item = ack.item;
  if (!item?.id) return null;
  if (snap.activeItemId && snap.activeItemId !== item.id) return null;

  const nextHigh =
    typeof item.currentBidUsd === 'number' && Number.isFinite(item.currentBidUsd)
      ? item.currentBidUsd
      : snap.currentBidUsd;
  const auctionEndsAt = item.auctionEndsAt !== undefined ? item.auctionEndsAt : snap.auctionEndsAt;
  const biddingOpenRaw =
    typeof item.biddingOpen === 'boolean' ? item.biddingOpen : snap.biddingOpen;
  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: 'active',
      biddingOpen: biddingOpenRaw,
      auctionEndsAt,
    },
    wallNowMs,
  );

  return {
    ...snap,
    activeItemId: item.id,
    currentBidUsd: nextHigh,
    minNextBidUsd: liveAuctionMinBidUsd({
      currentBidUsd: nextHigh,
      startingBidUsd: item.startingBidUsd ?? snap.startingBidUsd,
      priceUsd: snap.priceUsd,
      lastHighBidderId: item.lastHighBidderId ?? snap.lastHighBidderId,
    }),
    lastHighBidderUsername:
      item.lastHighBidderUsername !== undefined ? item.lastHighBidderUsername : snap.lastHighBidderUsername,
    lastHighBidderId: item.lastHighBidderId !== undefined ? item.lastHighBidderId : snap.lastHighBidderId,
    startingBidUsd: item.startingBidUsd ?? snap.startingBidUsd,
    auctionEndsAt,
    biddingOpen: lotBidPhase === 'bidding_open',
    lotBidPhase,
    fetchedAtMs: wallNowMs,
    serverNowMs: ack.serverNowMs ?? snap.serverNowMs,
  };
}

/** Optimistic merge when host opens bidding or timer extends via active_item_changed. */
export function mergeBuyerSnapshotForActiveItemChanged(
  snap: LiveRoomBuyerSnapshot,
  payload: RoomBroadcastPayload,
  wallNowMs: number,
): LiveRoomBuyerSnapshot | null {
  if (!payload.itemId) return null;
  if (snap.activeItemId && snap.activeItemId !== payload.itemId) return null;

  const auctionEndsAt =
    payload.auctionEndsAt !== undefined ? payload.auctionEndsAt : snap.auctionEndsAt;
  const biddingOpenRaw =
    typeof payload.biddingOpen === 'boolean' ? payload.biddingOpen : snap.biddingOpen;
  const lotBidPhase = resolveLiveAuctionLotBidPhase(
    {
      status: 'active',
      biddingOpen: biddingOpenRaw,
      auctionEndsAt,
    },
    wallNowMs,
  );

  return {
    ...snap,
    activeItemId: payload.itemId,
    auctionEndsAt,
    biddingOpen: lotBidPhase === 'bidding_open',
    lotBidPhase,
    fetchedAtMs: wallNowMs,
  };
}
