# Chaos engineering — live auction (runbook)

Run in **staging** with seeded QA rooms (`npm run qa:seed-live-auction` when permitted).

## Scenarios

| # | Fault | Steps | Pass criteria |
|---|--------|-------|-----------------|
| 1 | **Drain worker stopped** | Stop Container App job / kill `auction-fanout:drain` | Bids still `200`; `LiveAuctionEvent.publishedAt` null grows; restore worker → backlog drains; clients converge via seq + snapshot |
| 2 | **Redis unavailable** | Block `REDIS_URL` egress | Postgres + Supabase still work; no API 5xx spike; sidecar error logs only |
| 3 | **Kafka unavailable** | Revoke broker ACL / bad brokers env | Same as Redis |
| 4 | **Duplicate Idempotency-Key** | Replay same POST | Identical JSON; single `seq` in DB |
| 5 | **Clock skew** | skew client `Date` | UI still ordered by `auctionSeq`; countdown uses `serverNowMs` |
| 6 | **Supabase blip** | block wss briefly | Snapshot / fallback poll heals; no duplicate lower seq applied |

## Acceptance gates (per run)

- No `@@unique` violations on `(liveRoomId, seq)`.
- No unbounded growth of `publishedAt IS NULL` after recovery (steady state < threshold).

## Tooling

- k6: `load-tests/k6-live-auction-smoke.js`, `load-tests/k6-live-auction-readmix.js`
- Traces: OTel env from `docs/live-auction-observability-load-chaos.md`
