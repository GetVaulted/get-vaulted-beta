import { prisma } from "@/lib/prisma";
import { isBidPlacedPayloadV1 } from "@/lib/live-auction-event-schema";
import { scheduleCanonicalAuctionEventSidecars } from "@/lib/live-auction-stream/sidecars";
import { runLiveAuctionSpan } from "@/lib/live-auction-otel";
import { logLiveAuctionRtDebug } from "@/lib/live-auction-rt-debug";
import { emitActiveItemChangedAwait, emitBidPlacedAwait } from "@/lib/realtime-emit-server";

/**
 * Publishes pending `LiveAuctionEvent` rows (canonical durable log in Postgres).
 *
 * **Ordering:** Supabase / legacy `emitBidPlaced` runs **first** (low latency for viewers).
 * Redis/Kafka sidecars are **fire-and-forget** (never awaited before compat emit) so slow brokers
 * cannot delay realtime. See `docs/production-live-auction/CANONICAL-FANOUT.md`.
 */
export async function flushPendingLiveAuctionFanout(opts?: { liveRoomId?: string; limit?: number }): Promise<number> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  return runLiveAuctionSpan(
    "live_auction.fanout.flush",
    {
      "live.room_id": opts?.liveRoomId ?? "all",
      "live.fanout.limit": limit,
    },
    async () => {
  const rows = await prisma.liveAuctionEvent.findMany({
    where: {
      publishedAt: null,
      ...(opts?.liveRoomId ? { liveRoomId: opts.liveRoomId } : {}),
    },
    orderBy: [{ liveRoomId: "asc" }, { seq: "asc" }],
    take: limit,
    select: { id: true, liveRoomId: true, seq: true, eventType: true, payload: true },
  });

  let published = 0;
  for (const row of rows) {
    /** Canonical row is already committed; optional sidecars must not block Supabase compat emit. */
    let compatDelivered = row.eventType !== "bid_placed";
    try {
      if (row.eventType === "bid_placed" && isBidPlacedPayloadV1(row.payload)) {
        const p = row.payload;
        try {
          logLiveAuctionRtDebug("fanout compat emit start", { rowId: row.id, seq: row.seq, liveRoomId: row.liveRoomId });
          await emitBidPlacedAwait({
            liveRoomId: p.liveRoomId,
            itemId: p.itemId,
            amountUsd: p.amountUsd,
            bidderId: p.bidderId,
            listingId: p.listingId,
            roomVersion: p.roomVersion,
            itemVersion: p.itemVersion ?? undefined,
            auctionEndsAt: p.auctionEndsAt,
            biddingOpen: p.biddingOpen,
            leadingBidderId: p.leadingBidderId,
            leadingBidderUsername: p.leadingBidderUsername,
            auctionSeq: row.seq,
          });
          if (p.emitActiveItemChanged && !p.clutchTimeEnabled && p.auctionEndsAt) {
            await emitActiveItemChangedAwait(p.liveRoomId, p.itemId, {
              roomVersion: p.roomVersion,
              itemVersion: p.itemVersion ?? undefined,
              biddingOpen: p.biddingOpen,
              auctionEndsAt: p.auctionEndsAt,
            });
          }
          logLiveAuctionRtDebug("fanout compat emit ok", { rowId: row.id, seq: row.seq });
          compatDelivered = true;
        } catch (e) {
          console.error("[flushPendingLiveAuctionFanout] compat emit", row.id, e);
          logLiveAuctionRtDebug("fanout compat emit fail", { rowId: row.id, seq: row.seq, err: String(e) });
        }
        scheduleCanonicalAuctionEventSidecars({
          liveRoomId: row.liveRoomId,
          seq: row.seq,
          eventType: row.eventType,
          payload: p,
        });
      }
      if (compatDelivered) {
        await prisma.liveAuctionEvent.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
        published += 1;
      }
    } catch (e) {
      console.error("[flushPendingLiveAuctionFanout]", row.id, e);
    }
  }
  return published;
    },
  );
}
