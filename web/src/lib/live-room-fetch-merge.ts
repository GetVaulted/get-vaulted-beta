import type { LiveRoomDetailDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";

/**
 * When merging a full-room GET with in-memory detail, prefer the row that reflects newer auction state.
 * Stale read replicas can return older `itemVersion` / missing `biddingOpen` right after host Start or bids;
 * realtime may already have advanced — this prevents a snapshot from wiping that.
 */
function pickNewerLiveRoomItem(prev: LiveRoomItemDTO, incoming: LiveRoomItemDTO): LiveRoomItemDTO {
  const pv = prev.itemVersion ?? 0;
  const iv = incoming.itemVersion ?? 0;
  if (pv > iv) return prev;
  if (iv > pv) return incoming;
  if (prev.biddingOpen === true && incoming.biddingOpen !== true) return prev;
  if (incoming.biddingOpen === true && prev.biddingOpen !== true) return incoming;
  if (prev.biddingOpen && incoming.biddingOpen) {
    const pe = prev.auctionEndsAt ?? "";
    const ie = incoming.auctionEndsAt ?? "";
    if (pe && ie) return pe > ie ? prev : incoming;
  }
  return incoming;
}

export function mergeLiveRoomDetailFromFetch(prev: LiveRoomDetailDTO, incoming: LiveRoomDetailDTO): LiveRoomDetailDTO {
  const prevById = new Map(prev.items.map((i) => [i.id, i]));
  const prevRv = prev.roomVersion ?? 0;
  const incomingRv = incoming.roomVersion ?? 0;
  /** Stale read replicas can return an older `roomVersion` with a wrong `status` (e.g. ended) — do not regress lifecycle. */
  const staleRoomSnapshot = incomingRv < prevRv;
  /** Server list defines membership; only merge per-id when replica might lag behind realtime. */
  const mergedItems: LiveRoomItemDTO[] = incoming.items.map((inc) => {
    const p = prevById.get(inc.id);
    return p ? pickNewerLiveRoomItem(p, inc) : inc;
  });
  mergedItems.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const roomVersion = Math.max(prevRv, incomingRv);
  const auctionEventSeq = Math.max(prev.auctionEventSeq ?? 0, incoming.auctionEventSeq ?? 0);
  const activeItem = mergedItems.find((it) => it.status === "active") ?? null;
  return {
    ...incoming,
    ...(staleRoomSnapshot
      ? {
          status: prev.status,
          startedAt: prev.startedAt,
          endedAt: prev.endedAt,
          break: prev.break,
        }
      : {}),
    roomVersion,
    auctionEventSeq,
    items: mergedItems,
    activeItem,
    buyerLiveBidPaymentReady: incoming.buyerLiveBidPaymentReady ?? prev.buyerLiveBidPaymentReady,
    buyerLiveShippingReady: incoming.buyerLiveShippingReady ?? prev.buyerLiveShippingReady,
    /** Server is authoritative for payment lockout — always take incoming snapshot. */
    buyerUnresolvedPaymentFailure: incoming.buyerUnresolvedPaymentFailure ?? null,
  };
}
