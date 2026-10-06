# Canonical live auction events and fan-out

## Source of truth

1. **Bid acceptance** (HTTP `POST …/bid`) runs in a single Prisma transaction: marketplace / room state updates and `LiveAuctionEvent` insert share the same commit boundary.
2. **`LiveAuctionEvent`** rows (`liveRoomId`, monotonic `seq`, `eventType`, `payload`, optional `publishedAt`) are the **durable canonical log** per room.

`auctionSeq` exposed to WebSocket / HTTP ACK clients is the row’s `seq` (monotonic per `liveRoomId` via `@@unique([liveRoomId, seq])` and server-side increment on `LiveRoom.auctionEventSeq`).

## Start bidding (`PATCH …/items/:itemId` with `action: "startAuction"`)

Opening a timed window **does not** append `LiveAuctionEvent` rows and **does not** enqueue the Postgres outbox that `flushPendingLiveAuctionFanout` drains. Only bid acceptance (and host proxy resolution) writes canonical events. Start bidding therefore uses **compat realtime only** — `emitActiveItemChanged`, `emitLiveRoomQueueItemsChanged`, and (when a break round finalizes as sold) `emitPurchaseCompleted` — registered with Next.js `after()` so emits run **after the HTTP response completes** (still post-commit and off the interactive transaction). The PATCH caller gets fresh `item` JSON in the same response; other tabs rely on the broadcast. Bidders converge on `roomVersion` / `itemVersion` plus queue refetch; there is no `auctionSeq` bump until the first `bid_placed` event.

`scheduleAuctionFanout` / `flushPendingLiveAuctionFanout` is **not** wired on start: there are no unpublished `LiveAuctionEvent` rows to flush.

## Fan-out (`flushPendingLiveAuctionFanout`)

The bid `POST` handler returns the HTTP ACK **without awaiting** fan-out. It kicks off `flushPendingLiveAuctionFanout` immediately (fire-and-forget) and schedules a follow-up `after(() => flush…)` so serverless runtimes still drain unpublished `LiveAuctionEvent` rows. Compat realtime (`emitBidPlaced`) therefore does not block the bidder’s round-trip; clients that miss a broadcast reconcile via ACK merge, refetch, or event replay.

Processing order for each pending row:

1. **Compatibility emit** — `emitBidPlaced` / `emitActiveItemChanged` (Supabase / legacy realtime). This is **not** authoritative for long-term storage; consumers that missed it should **replay from `LiveAuctionEvent`**.
2. **Optional sidecars** — `scheduleCanonicalAuctionEventSidecars` (Redis / Kafka) is **fire-and-forget** so brokers never delay compat emit.
3. **`publishedAt`** is set only after compat emit succeeds, so a failed compat emit leaves the row eligible for retry.

## Client reconciliation

Use `replayLiveAuctionBidPlacedEvents` (`src/lib/live-auction-event-replay.ts`) with rows ordered by `seq` to rebuild high-bidder / amount state when realtime was missed.

## Operational notes

- Run `npm run auction-fanout:drain` (or cron) if `publishedAt` backlog grows (monitor count of `publishedAt IS NULL`).
- If Supabase is degraded, bids still persist; clients should refetch room state and/or replay events after reconnect.

## Remaining gaps

- Only `bid_placed` is replayed in the helper today; extend the reducer when new `eventType` values become client-critical.
- Cross-region read replicas may still show stale room snapshots briefly; replay + refetch remains the mitigation.
