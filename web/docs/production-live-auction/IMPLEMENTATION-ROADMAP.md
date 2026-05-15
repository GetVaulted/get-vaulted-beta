# Implementation roadmap, milestones, and cost

## Milestones (calendar order)

| Milestone | Scope | Indicative duration | Status in repo |
|-----------|--------|----------------------|----------------|
| **M0** | SLO doc + seq client merge + Postgres `LiveAuctionEvent` | 1–2 wks | **Done** (`docs/live-auction-production-slo.md`, client hooks) |
| **M1** | Idempotent bids + OTel spans + fan‑out drain | 2–3 wks | **Done** |
| **M1b** | Proxy bids (host lots) + Redis/Kafka sidecars | 1–2 wks | **Done** (this delivery) |
| **M2** | Dedicated fan‑out deployment (AKS / Container Apps) + autoscaling | 2–4 wks | Runbook + worker only |
| **M3** | Inventory holds + checkout coupling | 2–3 wks | Designed, not migrated |
| **M4** | Regional WS gateways + edge auth | 4–8 wks | Architecture only |
| **M5** | Kafka as primary consumer path (MSK) | 2–6 wks | Optional env |

## Engineering tasks (backlog)

1. **Listing proxy bids** — extend `placeListingBid` + `Bid` schema for max bids; unify event payload.
2. **`LiveAuctionInventoryHold`** — TTL holds; nightly reconciliation vs `Order`.
3. **Fan‑out consumer** — separate Node service tailing Kafka / Redis with bounded per‑room queues.
4. **Property tests** — merge order invariants on randomized `auctionSeq` streams.
5. **Regional replay** — read replicas for catalog only; auction writes stay primary region.

## Cost estimate (USD / month, excl. people)

| Profile | Infra ballpark |
|---------|----------------|
| **MVP** single region, Postgres + Supabase + optional Redis | **$1k–$5k** |
| **Serious prod** Kafka + multi‑AZ DB + regional gateways + observability | **$5k–$30k+** |
| **People** | Dominates; calendar above assumes 2–3 backend + 1 infra |

## Data needed to tighten sizing

Provide: peak CCU per show, peak bids/sec (room + global), regions (US vs EU), video sync tolerance, current connection caps.
