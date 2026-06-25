/**
 * Post Migration 1 smoke checks: Prisma (postgres role) + legacy Supabase client roles.
 */
import pg from "pg";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let failed = false;
function ok(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
  failed = true;
}

try {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM "User"');
  ok(`Prisma path: postgres role can SELECT "User" (count=${rows[0]?.n})`);
} catch (e) {
  fail(`Prisma User query failed: ${e instanceof Error ? e.message : e}`);
}

try {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM "LiveRoom"');
  ok(`Prisma path: postgres role can SELECT "LiveRoom" (count=${rows[0]?.n})`);
} catch (e) {
  fail(`Prisma LiveRoom query failed: ${e instanceof Error ? e.message : e}`);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  const { rows } = await client.query("SELECT id FROM public.profiles LIMIT 1");
  ok(`authenticated role can SELECT profiles (${rows.length} row sample)`);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`authenticated profiles SELECT failed: ${e instanceof Error ? e.message : e}`);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query('SELECT id FROM public."User" LIMIT 1');
  await client.query("COMMIT");
  fail('authenticated role should NOT read "User" table');
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  const msg = e instanceof Error ? e.message : String(e);
  if (/permission denied|insufficient privilege/i.test(msg)) {
    ok(`authenticated role blocked from "User"`);
  } else {
    fail(`Unexpected error testing "User" block: ${msg}`);
  }
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE anon");
  await client.query('SELECT id FROM public."Order" LIMIT 1');
  await client.query("COMMIT");
  fail('anon role should NOT read "Order" table');
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  const msg = e instanceof Error ? e.message : String(e);
  if (/permission denied|insufficient privilege/i.test(msg)) {
    ok(`anon role blocked from "Order"`);
  } else {
    fail(`Unexpected error testing "Order" block: ${msg}`);
  }
}

await client.end();

if (failed) process.exit(1);
console.log("\nPost-migration smoke checks passed.");
