# Prisma migration checklist (local dev)

## Symptom: `P3009` — “migrate found failed migrations”

Prisma stops applying new migrations until the failed row in `_prisma_migrations` is resolved. On this project the most common stuck migration is:

| Migration folder | What it does |
|------------------|--------------|
| `20260503200000_auction_payment_deadline` | `ALTER TABLE "Order" ADD COLUMN "paymentDeadlineAt" DATETIME` |

### Why it fails locally

Typical causes:

1. **`paymentDeadlineAt` already exists** on `Order` (e.g. a later migration such as `20260503210000_reconcile_marketplace_escrow_schema` recreated the table with that column, or the DB was previously updated with `db push` / manual SQL). Re-running `ADD COLUMN` raises “duplicate column” and Prisma records the migration as **failed**.
2. **Interrupted migrate** mid-file (rare).

### Exact local fix (pick one path)

**Path A — Column already exists (duplicate column error)**

Tell Prisma to treat the migration as applied without re-executing SQL:

```bash
npx prisma migrate resolve --applied 20260503200000_auction_payment_deadline
```

Or the npm alias:

```bash
npm run db:migrate:resolve:auction-deadline-applied
```

Then:

```bash
npx prisma migrate deploy
```

**Path B — Column missing but migration marked failed**

1. Add the column manually (or restore from backup), **or** roll back the failed entry and re-deploy:

```bash
npx prisma migrate resolve --rolled-back 20260503200000_auction_payment_deadline
npx prisma migrate deploy
```

Use **Path A** if `paymentDeadlineAt` is already present (check with `\d "Order"` in `psql`, Supabase Table Editor, or any Postgres client).

### Fresh database (CI / new clone)

1. Point `DATABASE_URL` at an empty Postgres database (or a dedicated branch database).
2. Run:

```bash
npx prisma migrate deploy
```

Integration tests: set **`INTEGRATION_DATABASE_URL`** (preferred) or **`DATABASE_URL`** to a disposable **PostgreSQL** URL before `npm run test:integration`. `bootstrapIntegrationPrisma` runs `migrate deploy` against that URL.

### What we do **not** rely on long-term

`prisma db push` bypasses migration history and can drift from production. Use it only for quick experiments; keep `migrate deploy` as the source of truth for shared and CI databases.
