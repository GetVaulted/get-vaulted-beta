# Design decisions and tradeoffs

## 1. Stream technology

| Option | Ordering | Replay | Ops cost | Latency | Fit |
|--------|----------|--------|----------|---------|-----|
| **Postgres `LiveAuctionEvent`** | `seq` per room | SQL + retention policy | Lowest (already deployed) | DB commit bound | **Current source of truth** |
| **Redis Streams** | Per stream key `auction:{liveRoomId}` | `XRANGE` | Low–medium | Sub‑ms append after connect | **Implemented sidecar** (`REDIS_URL`) |
| **Kafka** | Partition = `liveRoomId` | Excellent | Higher (MSK / Confluent) | ms‑scale broker hop | **Implemented sidecar** (`KAFKA_BROKERS`) |
| **Cloud Pub/Sub** | Ordering keys (per key ordering) | Good | IAM + wiring | Variable | Good if already on GCP; not wired in-repo |

**Recommendation:** Keep Postgres as **authoritative**; enable Redis for mid‑scale fan‑out consumers; adopt Kafka when you need multi‑subscriber replay, cross‑region log shipping, or throughput beyond a single Redis node.

## 2. Bid processor model

| Model | Pros | Cons |
|-------|------|------|
| **Row‑locked Postgres transaction** (current) | Simple, strong consistency per `liveRoomItemId`, FIFO per hot item | Throughput bounded by row lock duration |
| **Redis leader lease per room** | Faster coordination if DB contended | Extra failure modes; still need DB as SoT |
| **Dedicated service + Raft** | Extreme availability | Heavy ops; overkill until 10k+ concurrent rooms |

**Choice:** Postgres **single writer** with `updateMany` predicates + monotonic `auctionEventSeq`.

## 3. Fan‑out topology

| Option | Pros | Cons |
|--------|------|------|
| **Central WS cluster + backhaul** | Simple | Cross‑region tail latency |
| **Edge terminators** (CF / GA + regional pods) | Lower viewer RTT | Sticky sessions, auth at edge |
| **Hybrid** | Balance cost / latency | More moving parts |

**Current:** Supabase broadcast from API/drain worker. **Target:** regional gateways consuming Redis/Kafka behind the same `auctionSeq` contract.

## 4. Sequence strategy

**Monotonic `auctionSeq` per `liveRoomId`** (preferred) — implemented. Clock sync is **not** used for merge order.

## 5. Inventory

| Strategy | When to use |
|----------|-------------|
| **Pessimistic DB lock** (row + `updateMany`) | Single‑winner English auction (current default). |
| **Short‑lived reservation rows** | Multi‑unit or live + marketplace double‑sell risk — **recommended next migration** (`LiveAuctionInventoryHold` with TTL + checkout consume). |
| **Optimistic + compensation** | High write churn catalogs; harder for auction UX |

## 6. Idempotency

**`Idempotency-Key` + `LiveBidIdempotency` table** — stable replay of HTTP response body including `auctionSeq`. Stream offsets are **not** used as primary idempotency (HTTP clients lack offset on first try).

## 7. Backpressure

| Signal | Action |
|--------|--------|
| Fan‑out lag (`publishedAt` null grows) | Scale drain workers; increase `AUCTION_FANOUT_LIMIT` cautiously; alert |
| Broker slow | Sidecars are best‑effort; Postgres remains canonical |
| Client overload | Rate limit bid API; degrade non‑critical realtime (typing indicators) |

## 8. Proxy bids

**Host lots only** (`listingId` null): `maxProxyUsd` on POST + `LiveAuctionProxyBid` upsert + deterministic chain in the same transaction. **Listing lots** return `400` until marketplace `Bid` model supports max bids.
