# Deployment runbook — Microsoft Azure

Assumes: **Azure Container Apps** or **AKS** for the Next.js app + fan‑out worker, **Azure Database for PostgreSQL Flexible Server** (primary in auction region), optional **Azure Cache for Redis**, **Event Hubs for Kafka** or Confluent Cloud.

## Topology (recommended)

1. **Single write region** for auction hot path (e.g. `East US 2`).
2. **App Service / Container Apps** colocated with Postgres primary.
3. **Redis** (same region) for Streams sidecar if enabled (`REDIS_URL`).
4. **Event Hubs Kafka surface** or MSK‑compatible broker for `KAFKA_BROKERS`.
5. **Front Door** or **Application Gateway** for TLS + WAF; WebSocket‑aware timeout tuning.

## Environment variables (runtime)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Primary Postgres (pooled for serverless). |
| `REDIS_URL` | Optional Redis Streams sidecar. |
| `KAFKA_BROKERS` | Optional Kafka sidecar. |
| `KAFKA_TOPIC_AUCTION_EVENTS` | Defaults to `auction.events`. |
| `OTEL_EXPORTER_OTLP_*` | Traces to Azure Monitor / App Insights–compatible collector. |

## Deploy sequence (happy path)

1. Run **DB migration** (`prisma migrate deploy`) against primary — see `ZERO-DOWNTIME-MIGRATION.md`.
2. Deploy **API** revision (readiness probe on `/api/time` or health route).
3. Deploy **fan‑out drain** Container App job or always‑on replica running `npm run auction-fanout:drain` on a timer (1–5 s) **or** long‑running loop.
4. Enable **sidecars** gradually: set `REDIS_URL` / `KAFKA_BROKERS` in staging → canary 10% prod.
5. Watch dashboards (`MONITORING.md`) for drain lag and bid error rate.

## Rollback

1. Disable canary (remove `REDIS_URL` / `KAFKA_BROKERS` if misbehaving) — Postgres remains authoritative.
2. Revert API revision to previous image.
3. **Do not** roll back additive migrations without DBA plan; prefer forward fix.

## WebSocket / Supabase

Keep Supabase Realtime in the **same region** as Postgres primary to avoid commit→broadcast RTT inflation.
