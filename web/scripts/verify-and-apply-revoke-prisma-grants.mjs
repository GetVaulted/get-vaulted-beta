/**
 * Verify anon/authenticated grants on Prisma tables, optionally apply Migration 1.
 * Usage:
 *   node scripts/verify-and-apply-revoke-prisma-grants.mjs           # verify only
 *   node scripts/verify-and-apply-revoke-prisma-grants.mjs --apply   # apply if grants exist
 */
import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const apply = process.argv.includes("--apply");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const GRANTS_SQL = `
  SELECT
    c.relname AS table_name,
    grantee,
    string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN information_schema.table_privileges tp
    ON tp.table_schema = n.nspname AND tp.table_name = c.relname
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND grantee IN ('anon', 'authenticated')
    AND (
      c.relname ~ '^[A-Z]'
      OR c.relname = '_prisma_migrations'
    )
  GROUP BY c.relname, grantee
  ORDER BY c.relname, grantee;
`;

const PRISMA_TABLE_COUNT_SQL = `
  SELECT count(*)::int AS count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND (c.relname ~ '^[A-Z]' OR c.relname = '_prisma_migrations');
`;

const LEGACY_SAMPLE_SQL = `
  SELECT table_name, grantee, string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND table_name IN ('profiles', 'trade_offers', 'push_device_tokens', 'live_shows_public')
  GROUP BY table_name, grantee
  ORDER BY table_name, grantee;
`;

function printGrants(label, rows) {
  console.log(`\n=== ${label} (${rows.length} grant rows) ===`);
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  for (const row of rows) {
    console.log(`${row.table_name} | ${row.grantee} | ${row.privileges}`);
  }
}

await client.connect();

const { rows: tableCountRows } = await client.query(PRISMA_TABLE_COUNT_SQL);
const prismaTableCount = tableCountRows[0]?.count ?? 0;
console.log(`Prisma-managed tables in public schema: ${prismaTableCount}`);

const { rows: grantsBefore } = await client.query(GRANTS_SQL);
printGrants("BEFORE — anon/authenticated grants on Prisma tables", grantsBefore);

const { rows: legacySample } = await client.query(LEGACY_SAMPLE_SQL);
printGrants("Legacy Supabase tables (sanity check — should remain granted)", legacySample);

if (apply) {
  if (grantsBefore.length === 0) {
    console.log("\n⚠ No anon/authenticated grants found on Prisma tables — skipping REVOKE migration.");
  } else {
    const migrationPath = join(__dirname, "../../supabase/migrations/20260628120000_revoke_postgrest_prisma_tables.sql");
    const sql = readFileSync(migrationPath, "utf8");
    console.log("\nApplying Migration 1: revoke_postgrest_prisma_tables.sql …");
    await client.query(sql);
    const { rows: grantsAfter } = await client.query(GRANTS_SQL);
    printGrants("AFTER — anon/authenticated grants on Prisma tables", grantsAfter);
    if (grantsAfter.length === 0) {
      console.log("\n✓ Migration 1 applied successfully — all Prisma table API grants revoked.");
    } else {
      console.error("\n✗ Some grants remain after migration:");
      process.exitCode = 1;
    }
  }
} else {
  console.log("\nDry run only. Pass --apply to execute Migration 1 when grants exist.");
}

await client.end();
