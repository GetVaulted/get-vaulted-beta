# Acceptance SLA and gates

## What we do **not** promise

- **Global sub‑10 ms p95** from finger‑tap to every viewer pixel — **infeasible** (physics + mobile last‑mile + browser).

## Published targets (defensible)

| Tier | Metric | Target (configure after k6 on your host) |
|------|--------|-------------------------------------------|
| **T1 — Durable** | p95 time from bid POST enter → `LiveAuctionEvent` row visible on primary | **15–80 ms** same region |
| **T2 — Fan‑out** | p95 `createdAt` → `publishedAt` (drain lag) | **< 250 ms** steady state |
| **T3 — Viewer** | p95 bid line update same metro | **< 150–400 ms** |
| **Cross‑region** | Viewer p95 | **< 800 ms–1.5 s** without dedicated edge fan‑out |

## Functional acceptance gates

1. **Ordering:** `auctionSeq` strictly increases per `liveRoomId` in DB and after client merge.
2. **Idempotency:** duplicate `Idempotency-Key` → identical JSON + same `auctionSeq`.
3. **Proxy (host lots):** with two max bids, chain terminates with highest feasible leader; ≤ `MAX_PROXY_CHAIN` iterations.
4. **No double publish:** `@@unique([liveRoomId, seq])` prevents duplicate seq.
5. **Chaos:** kill drain worker → backlog grows; restore → `publishedAt` drains without seq reuse.

## k6 / chaos

See `docs/live-auction-observability-load-chaos.md`, `load-tests/k6-live-auction-smoke.js`, and `load-tests/k6-live-auction-readmix.js`.
