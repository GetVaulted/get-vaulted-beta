# Auction fan-out worker (decoupled from API)

Today, `LiveAuctionEvent` rows are written in the same Postgres transaction as bid state (`src/app/api/live-rooms/[id]/items/[itemId]/bid/route.ts`). Publishing to Supabase broadcast is **not** inside that transaction: `after()` schedules `flushPendingLiveAuctionFanout` in `src/lib/live-auction-fanout-flush.ts`.

## Moving flush off the web process

1. **Cron / queue worker** (recommended next step): run `npm run auction-fanout:drain` on a schedule (e.g. every 1–5 s) or from a job queue. The script calls `flushPendingLiveAuctionFanout` with an optional room id and `AUCTION_FANOUT_LIMIT`.
2. **Horizontal workers**: multiple drain processes are safe if they race on the same row: only one `update publishedAt` wins; the other may re-emit (clients dedupe by `auctionSeq` in `LiveRoomShell`).
3. **Kafka / regional gateways** (later): treat `LiveAuctionEvent` as the outbox; a publisher tails unpublished rows or reads the append-only log and pushes to partition `liveRoomId`. WebSocket gateways subscribe per room.

## Optional Redis / Kafka sidecars

When `REDIS_URL` or `KAFKA_BROKERS` is set, `flushPendingLiveAuctionFanout` dual-writes each flushed `bid_placed` to **Redis Streams** (`auction:{liveRoomId}`) and/or **Kafka** (topic `KAFKA_TOPIC_AUCTION_EVENTS` or `auction.events`; message key = `liveRoomId`). Failures are logged only — **Postgres remains the source of truth**. See `src/lib/live-auction-stream/sidecars.ts` and `docs/production-live-auction/README.md`.

## Environment

Same as the Next.js app: `DATABASE_URL`, Supabase keys for `emitBidPlaced` / `emitActiveItemChanged` when draining outside Next, ensure `src/lib/realtime-emit-server` dependencies (service role) are available in that runtime.

## Partition key (Kafka)

Use **`liveRoomId`** as the partition key so per-room order matches `seq` monotonicity (see `docs/live-auction-production-slo.md`).
