# Live auction: production SLOs and client merge rules

This document defines **realistic** service-level objectives and how browsers should merge state. It complements the canonical event pipeline (`LiveAuctionEvent` + fan-out flush).

## Latency tiers (what we measure)

| Tier | Meaning | Typical p95 target |
|------|---------|-------------------|
| **T1: durable** | Bid accepted and row visible in `LiveAuctionEvent` (same region, warm DB) | 15–80 ms |
| **T2: published** | Supabase broadcast (or future WS gateway) has been sent for that event | +1–20 ms after T1 |
| **T3: viewer** | User’s UI applied event (includes JS, paint, mobile radio) | +20–400 ms after T2 |

We **do not** promise global end-to-end sub-10 ms p95. Marketing language: **sub-second** synchronized experience; **tens of milliseconds** for the authoritative path in-region.

## SLO-A: ordering and durability

- Every accepted bid produces exactly **one** `LiveAuctionEvent` row with monotonic **`seq` per `liveRoomId`** before fan-out runs.
- **`seq` is the source of truth** for merge order. Wall-clock `emittedAt` is telemetry only.
- Stale or duplicate realtime payloads with **`auctionSeq` ≤ last applied** for that room are ignored (see `LiveRoomShell`).

## SLO-B: reconciliation

- If `itemVersion` or `roomVersion` **jumps backward** after an apply, clients must **GET** `/api/live-rooms/[id]` (existing snapshot).
- If **`auctionSeq` gap** is detected (`seq > last + 1`), schedule a **snapshot refresh** (already patterned as `scheduleFallbackRefresh`).

## Client merge rules (seq-first)

1. On **HTTP bid ACK**, apply `item` / `roomVersion` from JSON; if **`auctionSeq`** is present, set `lastAuctionSeqRef = max(last, auctionSeq)`.
2. On **`bid_placed` realtime**, if payload includes **`auctionSeq`**, drop the event when `auctionSeq < lastAuctionSeqRef` (duplicate or replay). Otherwise apply merge and set `lastAuctionSeqRef = auctionSeq`.
3. When **`auctionSeq` is absent** (legacy emitters), fall back to **`roomVersion` / `itemVersion`** monotonic checks only.

## Kafka / Redis (future)

When moving off Postgres-only fan-out: partition key = **`liveRoomId`** so per-room total order is preserved. Global order across rooms is not required.
