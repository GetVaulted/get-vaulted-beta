# Zero‑downtime database migration — live auction

## Principles

1. **Additive first:** new tables/columns with safe defaults; no destructive DDL in the hot path.
2. **Deploy app after migration** that tolerates missing optional columns (not applicable here — Prisma client must match).
3. **Backward compatibility:** old app versions ignore unknown JSON fields; new rows (`LiveAuctionProxyBid`) are unused until new code ships.

## `LiveAuctionProxyBid` rollout

1. **Pre‑deploy:** run `npx prisma migrate deploy` (creates empty table, indexes, FKs).
2. **Deploy API** with new code paths (POST may upsert proxy rows).
3. **Post‑deploy:** verify error rate, `pg_stat_activity` lock time on `LiveRoomItem`, and drain lag.

## Rollback (schema)

- Prefer **keep table** empty and revert app if needed (no data loss).
- **Drop table** only off‑hours with confirmed no FK references from other services.

## Existing objects (`LiveAuctionEvent`, `LiveBidIdempotency`, `auctionEventSeq`)

Already additive. If rolling out to a DB without them:

1. Migrate deploy (adds columns/tables).
2. Deploy app — new bids begin populating `LiveAuctionEvent`.
3. Backfill **not required** for seq (starts at 0).

## Verification checklist

- [ ] `SELECT COUNT(*) FROM "LiveAuctionEvent" WHERE "publishedAt" IS NULL` stable under load.
- [ ] Duplicate `Idempotency-Key` returns identical body.
- [ ] `@@unique([liveRoomId, seq])` — no violations in logs.
