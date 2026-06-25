/**
 * Verify RLS policies and grants on legacy public.orders / public.payments.
 * Usage:
 *   node scripts/verify-and-apply-lock-legacy-orders-payments.mjs
 *   node scripts/verify-and-apply-lock-legacy-orders-payments.mjs --apply
 *   node scripts/verify-and-apply-lock-legacy-orders-payments.mjs --post-check
 */
import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const apply = process.argv.includes("--apply");
const postCheck = process.argv.includes("--post-check");

const TABLES = ["orders", "payments"];

const POLICIES_SQL = `
  SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  ORDER BY tablename, policyname;
`;

const GRANTS_SQL = `
  SELECT table_name, grantee, string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = ANY($1::text[])
    AND grantee IN ('anon', 'authenticated')
  GROUP BY table_name, grantee
  ORDER BY table_name, grantee;
`;

function printPolicies(label, rows) {
  console.log(`\n=== ${label} (${rows.length} policies) ===`);
  if (!rows.length) {
    console.log("(none)");
    return;
  }
  for (const r of rows) {
    console.log(`${r.tablename} | ${r.policyname} | ${r.cmd} | roles=${JSON.stringify(r.roles)}`);
  }
}

function printGrants(label, rows) {
  console.log(`\n=== ${label} (${rows.length} grant rows) ===`);
  if (!rows.length) {
    console.log("(none)");
    return;
  }
  for (const r of rows) {
    console.log(`${r.table_name} | ${r.grantee} | ${r.privileges}`);
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: policies } = await client.query(POLICIES_SQL, [TABLES]);
const { rows: grants } = await client.query(GRANTS_SQL, [TABLES]);

if (!postCheck) {
  printPolicies("RLS policies", policies);
  printGrants("Table grants (anon/authenticated)", grants);
}

if (apply) {
  const hasWritePolicies = policies.some(
    (p) =>
      (p.tablename === "orders" && (p.cmd === "INSERT" || p.cmd === "UPDATE" || p.cmd === "ALL")) ||
      (p.tablename === "payments" && (p.cmd === "INSERT" || p.cmd === "ALL")),
  );
  const authHasWriteGrants = grants.some(
    (g) =>
      g.grantee === "authenticated" &&
      /INSERT|UPDATE|DELETE/.test(g.privileges),
  );

  if (!hasWritePolicies && !authHasWriteGrants) {
    console.log("\n⚠ No client write policies/grants to remove — skipping Migration 2.");
  } else {
    const migrationPath = join(
      __dirname,
      "../../supabase/migrations/20260628120100_lock_legacy_orders_payments.sql",
    );
    console.log("\nApplying Migration 2 …");
    await client.query(readFileSync(migrationPath, "utf8"));
    const { rows: policiesAfter } = await client.query(POLICIES_SQL, [TABLES]);
    const { rows: grantsAfter } = await client.query(GRANTS_SQL, [TABLES]);
    printPolicies("AFTER — RLS policies", policiesAfter);
    printGrants("AFTER — table grants", grantsAfter);
  }
}

if (postCheck || apply) {
  let failed = false;
  const { rows: policiesNow } = await client.query(POLICIES_SQL, [TABLES]);
  const { rows: grantsNow } = await client.query(GRANTS_SQL, [TABLES]);

  const orderSelect = policiesNow.some((p) => p.tablename === "orders" && p.cmd === "SELECT");
  const paymentSelect = policiesNow.some((p) => p.tablename === "payments" && p.cmd === "SELECT");
  const orderWritePolicy = policiesNow.some(
    (p) => p.tablename === "orders" && (p.cmd === "INSERT" || p.cmd === "UPDATE"),
  );
  const paymentInsertPolicy = policiesNow.some((p) => p.tablename === "payments" && p.cmd === "INSERT");
  const authOrderWriteGrant = grantsNow.some(
    (g) => g.table_name === "orders" && g.grantee === "authenticated" && /INSERT|UPDATE|DELETE/.test(g.privileges),
  );
  const authPaymentWriteGrant = grantsNow.some(
    (g) => g.table_name === "payments" && g.grantee === "authenticated" && /INSERT|UPDATE|DELETE/.test(g.privileges),
  );

  console.log("\n=== Post-check ===");
  console.log(orderSelect ? "✓ orders SELECT policy present" : "✗ orders SELECT policy missing");
  console.log(paymentSelect ? "✓ payments SELECT policy present" : "✗ payments SELECT policy missing");
  console.log(!orderWritePolicy ? "✓ no orders INSERT/UPDATE policies" : "✗ orders write policies remain");
  console.log(!paymentInsertPolicy ? "✓ no payments INSERT policy" : "✗ payments INSERT policy remains");
  console.log(!authOrderWriteGrant ? "✓ authenticated cannot DML orders" : "✗ authenticated still has orders DML grant");
  console.log(
    !authPaymentWriteGrant ? "✓ authenticated cannot DML payments" : "✗ authenticated still has payments DML grant",
  );

  if (!orderSelect || !paymentSelect || orderWritePolicy || paymentInsertPolicy || authOrderWriteGrant || authPaymentWriteGrant) {
    failed = true;
  }

  // Role simulation: SELECT allowed path exists; INSERT blocked at grant layer
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT id FROM public.orders LIMIT 0");
    console.log("✓ authenticated role can run SELECT on orders (0 rows ok)");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("✗ authenticated SELECT orders failed:", e instanceof Error ? e.message : e);
    failed = true;
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      "INSERT INTO public.orders (listing_id, buyer_id, seller_id, total_cents) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 100)",
    );
    await client.query("COMMIT");
    console.error("✗ authenticated INSERT orders should be blocked");
    failed = true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (/permission denied|insufficient privilege|violates row-level security/i.test(msg)) {
      console.log("✓ authenticated INSERT orders blocked");
    } else {
      console.error("✗ unexpected orders INSERT error:", msg);
      failed = true;
    }
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      "INSERT INTO public.payments (user_id, amount_cents, kind, status) VALUES (gen_random_uuid(), 100, 'marketplace_checkout', 'pending')",
    );
    await client.query("COMMIT");
    console.error("✗ authenticated INSERT payments should be blocked");
    failed = true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (/permission denied|insufficient privilege|violates row-level security/i.test(msg)) {
      console.log("✓ authenticated INSERT payments blocked");
    } else {
      console.error("✗ unexpected payments INSERT error:", msg);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
  else console.log("\nPost-check passed.");
}

await client.end();
