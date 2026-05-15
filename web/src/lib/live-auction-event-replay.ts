import { isBidPlacedPayloadV1 } from "@/lib/live-auction-event-schema";

/** Folded state after replaying canonical `bid_placed` events in `seq` order for one room. */
export type ReplayLiveAuctionBidState = {
  roomVersion: number;
  byItemId: Record<
    string,
    {
      amountUsd: number;
      leadingBidderId: string;
      itemVersion: number | null;
      auctionEndsAt: string | null;
    }
  >;
};

/**
 * Reconstructs high-bid view from persisted `LiveAuctionEvent` rows (canonical source).
 * Used for reconciliation when realtime fan-out was missed.
 */
export function replayLiveAuctionBidPlacedEvents(
  rows: { seq: number; eventType: string; payload: unknown }[],
): ReplayLiveAuctionBidState {
  let roomVersion = 0;
  const byItemId: ReplayLiveAuctionBidState["byItemId"] = {};
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  for (const row of sorted) {
    if (row.eventType !== "bid_placed" || !isBidPlacedPayloadV1(row.payload)) continue;
    const p = row.payload;
    roomVersion = Math.max(roomVersion, p.roomVersion);
    byItemId[p.itemId] = {
      amountUsd: p.amountUsd,
      leadingBidderId: p.leadingBidderId,
      itemVersion: p.itemVersion,
      auctionEndsAt: p.auctionEndsAt,
    };
  }
  return { roomVersion, byItemId };
}
