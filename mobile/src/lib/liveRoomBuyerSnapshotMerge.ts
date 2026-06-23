import { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';
import type { LiveRoomBuyerSnapshot, LiveBidHttpAck } from '../api/liveRoomBuyerRepository';
import type { RoomBroadcastPayload } from './realtimeChannels';

export type BuyerSnapshotReconcileResult = {
  snap: LiveRoomBuyerSnapshot;
  /** A new lot / room / active item — bid amounts may legitimately reset. */
  lotChanged: boolean;
  /** Incoming snapshot reported a lower high bid for the same lot — its bid fields were ignored. */
  staleIgnored: boolean;
  /** Incoming snapshot advanced the high bid for the same lot. */
  advanced: boolean;
};

/**
 * Reconcile a freshly fetched/polled snapshot against the locally known one.
 *
 * **Server-authoritative:** active item, break phase, variants, and all non-bid commerce fields
 * always come from `next` (the latest server snapshot).
 *
 * **Monotonic (bid-only):** while the same lot is active, a stale snapshot must never lower
 * `currentBidUsd` / `minNextBidUsd` or drop the high bidder — but it must still apply new break /
 * division / active-item state from the server.
 */
export function reconcileBuyerSnapshotMonotonic(
  prev: LiveRoomBuyerSnapshot | null,
  next: LiveRoomBuyerSnapshot,
): BuyerSnapshotReconcileResult {
  if (!prev) return { snap: next, lotChanged: false, staleIgnored: false, advanced: false };

  const lotChanged =
    prev.roomId !== next.roomId || (prev.activeItemId ?? null) !== (next.activeItemId ?? null);
  if (lotChanged) {
    return { snap: next, lotChanged: true, staleIgnored: false, advanced: false };
  }

  const prevHigh = prev.currentBidUsd;
  const nextHigh = next.currentBidUsd;
  const prevHasHigh = typeof prevHigh === 'number' && Number.isFinite(prevHigh);
  const nextHasHigh = typeof nextHigh === 'number' && Number.isFinite(nextHigh);

  const highRegressed =
    prevHasHigh && (!nextHasHigh || (nextHigh as number) < (prevHigh as number));

  const prevMin = prev.minNextBidUsd;
  const nextMin = next.minNextBidUsd;
  const sameHigh =
    prevHasHigh && nextHasHigh && (prevHigh as number) === (nextHigh as number);
  const minNextRegressed =
    sameHigh &&
    typeof prevMin === 'number' &&
    Number.isFinite(prevMin) &&
    (typeof nextMin !== 'number' || !Number.isFinite(nextMin) || (nextMin as number) < (prevMin as number));

  if (highRegressed || minNextRegressed) {
    const preservedHigh = highRegressed ? (prevHigh as number) : (nextHigh as number);
    return {
      snap: {
        ...next,
        currentBidUsd: preservedHigh,
        minNextBidUsd: liveAuctionMinBidUsd({
          currentBidUsd: preservedHigh,
          startingBidUsd: next.startingBidUsd ?? prev.startingBidUsd,
          priceUsd: next.priceUsd ?? prev.priceUsd,
          lastHighBidderId: prev.lastHighBidderId ?? next.lastHighBidderId,
        }),
        lastHighBidderId: prev.lastHighBidderId ?? next.lastHighBidderId,
        lastHighBidderUsername: prev.lastHighBidderUsername ?? next.lastHighBidderUsername,
      },
      lotChanged: false,
      staleIgnored: true,
      advanced: false,
    };
  }

  const advanced = prevHasHigh && nextHasHigh && (nextHigh as number) > (prevHigh as number);
  return { snap: next, lotChanged: false, staleIgnored: false, advanced };
}

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

  const ackHigh =
    typeof item.currentBidUsd === 'number' && Number.isFinite(item.currentBidUsd)
      ? item.currentBidUsd
      : snap.currentBidUsd;
  // Monotonic: an ACK must never lower the displayed high bid for the same active lot.
  const nextHigh =
    typeof ackHigh === 'number' && typeof snap.currentBidUsd === 'number'
      ? Math.max(ackHigh, snap.currentBidUsd)
      : ackHigh;
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

/** Optimistic merge when host pins a lot or opens bidding via active_item_changed. */
export function mergeBuyerSnapshotForActiveItemChanged(
  snap: LiveRoomBuyerSnapshot,
  payload: RoomBroadcastPayload,
  wallNowMs: number,
): LiveRoomBuyerSnapshot | null {
  if (!payload.itemId) return null;

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

  const lotChanged = (snap.activeItemId ?? null) !== payload.itemId;

  if (lotChanged) {
    // Drop prior-lot bid state immediately — a delayed GET must not show the last winning bid as the opening price.
    return {
      ...snap,
      activeItemId: payload.itemId,
      activeItemTitle: null,
      activeItemImageUrl: null,
      activeItemSalesFormat: null,
      activeItemListingId: null,
      activeItemVariantAssignmentMode: null,
      activeItemVariants: undefined,
      currentBidUsd: null,
      minNextBidUsd: liveAuctionMinBidUsd({
        currentBidUsd: null,
        startingBidUsd: 1,
        priceUsd: null,
        lastHighBidderId: null,
      }),
      lastHighBidderId: null,
      lastHighBidderUsername: null,
      startingBidUsd: null,
      priceUsd: null,
      auctionEndsAt: payload.auctionEndsAt !== undefined ? payload.auctionEndsAt : null,
      biddingOpen: lotBidPhase === 'bidding_open',
      lotBidPhase,
      fetchedAtMs: wallNowMs,
    };
  }

  return {
    ...snap,
    activeItemId: payload.itemId,
    auctionEndsAt,
    biddingOpen: lotBidPhase === 'bidding_open',
    lotBidPhase,
    fetchedAtMs: wallNowMs,
  };
}
