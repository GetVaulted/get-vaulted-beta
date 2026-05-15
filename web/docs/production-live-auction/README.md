# Production live auction — documentation index

| Document | Contents |
|----------|----------|
| [INVENTORY-HOLDS.md](./INVENTORY-HOLDS.md) | Reservation ledger, constraints, lifecycle, rollback, gaps |
| [CANONICAL-FANOUT.md](./CANONICAL-FANOUT.md) | Canonical `LiveAuctionEvent` log, fan-out ordering, replay |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Diagram, component responsibilities, latency stance |
| [DESIGN-AND-TRADEOFFS.md](./DESIGN-AND-TRADEOFFS.md) | Kafka vs Redis vs Postgres, processor model, fan‑out, inventory |
| [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) | Milestones, timeline, cost, backlog |
| [ACCEPTANCE-SLA.md](./ACCEPTANCE-SLA.md) | Realistic SLO tiers + acceptance gates |
| [DEPLOY-AZURE-RUNBOOK.md](./DEPLOY-AZURE-RUNBOOK.md) | Microsoft Azure topology and rollout |
| [ZERO-DOWNTIME-MIGRATION.md](./ZERO-DOWNTIME-MIGRATION.md) | Additive DB rollout / rollback |
| [MONITORING.md](./MONITORING.md) | Metrics, dashboards, alert YAML sketch |
| [CHAOS-RUNBOOK.md](./CHAOS-RUNBOOK.md) | Fault scenarios and pass criteria |

Also see: `docs/live-auction-production-slo.md`, `docs/live-auction-observability-load-chaos.md`, `services/auction-fanout/README.md`.

**Code (high level)**

- Bid API + processor: `src/app/api/live-rooms/[id]/items/[itemId]/bid/route.ts`, `src/services/live-auction/resolve-live-proxy-bid-chain.ts`
- Canonical log + outbox: `LiveAuctionEvent`, `src/lib/live-auction-fanout-flush.ts`
- Optional Redis/Kafka: `src/lib/live-auction-stream/sidecars.ts` (`REDIS_URL`, `KAFKA_BROKERS`)
- Observability: `src/lib/live-auction-otel.ts`, `src/instrumentation.ts`
