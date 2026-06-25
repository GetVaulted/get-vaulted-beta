/**
 * Verify EXECUTE grants on QA RPCs for anon/authenticated, optionally apply Migration 3.
 * Usage:
 *   node scripts/verify-and-apply-revoke-qa-rpc-grants.mjs           # verify only
 *   node scripts/verify-and-apply-revoke-qa-rpc-grants.mjs --apply   # apply if grants exist
 */
import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const apply = process.argv.includes("--apply");

const QA_FUNCTIONS = [
  "qa_create_incoming_trade_from_demo",
  "qa_upsert_mock_shipping_labels",
  "qa_seed_partner_trade_listing",
];

const GRANTS_SQL = `
  SELECT
    p.proname AS function_name,
    grantee,
    privilege_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN information_schema.routine_privileges rp
    ON rp.routine_schema = n.nspname
   AND rp.routine_name = p.proname
  WHERE n.nspname = 'public'
    AND p.proname = ANY($1::text[])
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ORDER BY p.proname, grantee;
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: grantsBefore } = await client.query(GRANTS_SQL, [QA_FUNCTIONS]);
console.log(`\n=== BEFORE — anon/authenticated EXECUTE on QA RPCs (${grantsBefore.length} rows) ===`);
if (grantsBefore.length === 0) {
  console.log("(none)");
} else {
  for (const row of grantsBefore) {
    console.log(`${row.function_name} | ${row.grantee} | ${row.privilege_type}`);
  }
}

if (apply) {
  if (grantsBefore.length === 0) {
    console.log("\n⚠ No anon/authenticated EXECUTE grants on QA RPCs — skipping Migration 3.");
  } else {
    const migrationPath = join(
      __dirname,
      "../../supabase/migrations/20260628120200_revoke_qa_rpc_authenticated_grant.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");
    console.log("\nApplying Migration 3: revoke_qa_rpc_authenticated_grant.sql …");
    await client.query(sql);
    const { rows: grantsAfter } = await client.query(GRANTS_SQL, [QA_FUNCTIONS]);
    console.log(`\n=== AFTER — anon/authenticated EXECUTE on QA RPCs (${grantsAfter.length} rows) ===`);
    if (grantsAfter.length === 0) {
      console.log("(none)");
      console.log("\n✓ Migration 3 applied — QA RPCs no longer callable via authenticated PostgREST.");
    } else {
      for (const row of grantsAfter) {
        console.log(`${row.function_name} | ${row.grantee} | ${row.privilege_type}`);
      }
      console.error("\n✗ Some client grants remain after migration.");
      process.exitCode = 1;
    }
  }
} else {
  console.log("\nDry run only. Pass --apply to execute Migration 3 when grants exist.");
}

await client.end();
