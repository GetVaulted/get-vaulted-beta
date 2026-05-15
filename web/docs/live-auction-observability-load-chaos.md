# Live auction: observability, load testing, and chaos drills

This complements `docs/live-auction-production-slo.md` with concrete tooling in this repo.

## OpenTelemetry (server)

When **`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`** or **`OTEL_EXPORTER_OTLP_ENDPOINT`** is set, `src/instrumentation.ts` registers the Node SDK and exports traces over OTLP/HTTP.

| Variable | Purpose |
|----------|---------|
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Full trace ingest URL (may include `/v1/traces`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP URL; `/v1/traces` is appended if missing. |
| `OTEL_SERVICE_NAME` | Defaults to `get-vaulted`. |

**Spans**

- `live_auction.bid.post` — bid API handler (see `src/app/api/live-rooms/[id]/items/[itemId]/bid/route.ts`).
- `live_auction.fanout.flush` — `flushPendingLiveAuctionFanout` (`src/lib/live-auction-fanout-flush.ts`).

Add histograms in your collector or APM for **time-to-durable** (bid span end − start) and **fan-out lag** (flush span timestamp − `LiveAuctionEvent.createdAt`) once you export metrics (not wired in-repo yet).

## k6 (HTTP smoke)

Script: `load-tests/k6-live-auction-smoke.js`  
Read mix (optional public room GET): `load-tests/k6-live-auction-readmix.js`

Hits a lightweight public endpoint (`/api/time`) to validate baseline latency under concurrent VUs. It does **not** exercise authenticated bidding; extend with tokens and `POST` bid paths when you have a staging auth harness.

```bash
k6 run -e BASE_URL=https://your-staging-host load-tests/k6-live-auction-smoke.js
k6 run -e BASE_URL=https://your-staging-host -e LIVE_ROOM_ID=your_room_id load-tests/k6-live-auction-readmix.js
```

**Doc index:** `docs/production-live-auction/README.md` (architecture, Azure deployment, monitoring alerts, chaos runbook, zero‑downtime migration).

**Acceptance (adjust per environment)**

- `http_req_failed` rate below threshold in script options.
- p95 latency for `/api/time` stable during the run (no connection pool exhaustion on the app or DB).

## WebSocket / ordering (manual or xk6)

Property-style checks from the plan:

1. Per room, applied `auctionSeq` is strictly increasing after client merge (`LiveRoomShell` + `shouldProcessRealtimePayload`).
2. Duplicate `Idempotency-Key` on `POST` bid returns the same JSON body and `auctionSeq`.

For multi-VU WebSocket tests, use **k6 xk6-websocket** or a small Playwright suite against staging.

## Chaos drills (staging)

Run during a controlled show replay or QA room (`npm run qa:seed-live-auction` when allowed).

| Drill | Action | Pass criteria |
|-------|--------|----------------|
| Fan-out worker stop | Stop `auction-fanout:drain` / kill worker; bids still succeed | Rows appear in `LiveAuctionEvent`; after worker resumes, `publishedAt` fills and viewers catch up or snapshot refresh heals UI |
| Duplicate POST | Same `Idempotency-Key` twice | Identical JSON; no double `seq` |
| Supabase blip | Block outbound to Realtime briefly | Bids durable in DB; full-room GET or fallback poll restores state; no permanent `seq` regression |
| Version gap | Inject older `roomVersion` broadcast (test harness) | Client schedules snapshot refresh (`scheduleFallbackRefresh`) |

Document results (timestamp, environment, pass/fail) in your incident or release checklist.
