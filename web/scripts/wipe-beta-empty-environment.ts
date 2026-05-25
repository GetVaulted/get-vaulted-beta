/**
 * COMPLETE beta wipe — ZERO users, NO seed (Supabase xkaaicokjgmpbctfermj ONLY).
 *
 * Deletes ALL Prisma app data + ALL Supabase Auth users. Does NOT create sellerqa/buyerqa.
 * Use for manual end-to-end launch flow testing from true zero.
 *
 * Safety (all required):
 *   CONFIRM_BETA_FULL_WIPE=1
 *   CONFIRM_BETA_EMPTY_WIPE=1
 *   DATABASE_URL + SUPABASE service role → xkaaicokjgmpbctfermj
 *
 * Usage (from web/):
 *   CONFIRM_BETA_FULL_WIPE=1 CONFIRM_BETA_EMPTY_WIPE=1 npm run qa:wipe-beta-empty -- --dry-run
 *   CONFIRM_BETA_FULL_WIPE=1 CONFIRM_BETA_EMPTY_WIPE=1 npm run qa:wipe-beta-empty
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

import { createClient } from "@supabase/supabase-js";
import { EXPECTED_BETA_PROJECT_REF } from "../src/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";
import { BETA_APP_COUNT_DELEGATES, betaTruncateSql } from "./lib/beta-app-tables";
import { assertBetaFullWipeAllowed, printBetaWipeBanner } from "./lib/beta-wipe-guards";

const dryRun = process.argv.includes("--dry-run");
const BETA_API =
  process.env.BETA_API_BASE_URL?.trim() ||
  process.env.SMOKE_BASE_URL?.trim() ||
  "https://beta.shopgetvaulted.com";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

async function listAllAuthUsers(admin: ReturnType<typeof createClient>) {
  const all: { id: string; email: string | undefined }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    for (const u of users) {
      all.push({ id: u.id, email: u.email });
    }
    if (users.length < 500) break;
    page += 1;
  }
  return all;
}

async function deleteAllSupabaseAuthUsers(
  admin: ReturnType<typeof createClient>,
  logFn: (msg: string) => void,
) {
  const users = await listAllAuthUsers(admin);
  logFn(`  deleting ${users.length} Supabase Auth user(s) …`);
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email ?? u.id}: ${error.message}`);
  }
  logFn(`  deleted ${users.length} Auth user(s)`);
}

async function countAllTables(p: ReturnType<typeof createPostgresPrismaClient>) {
  const rows: { table: string; count: number }[] = [];
  let total = 0;
  for (const { table, delegate } of BETA_APP_COUNT_DELEGATES) {
    const model = (p as Record<string, { count: () => Promise<number> }>)[delegate];
    const count = model ? await model.count() : 0;
    rows.push({ table, count });
    total += count;
  }
  return { rows, total };
}

async function printInventory(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  log("Current row counts (will ALL be deleted):");
  const { rows, total } = await countAllTables(p);
  for (const { table, count } of rows) {
    if (count > 0) log(`  ${table.padEnd(28)} ${count}`);
  }
  log(`  ${"TOTAL".padEnd(28)} ${total}`);

  const authUsers = await listAllAuthUsers(admin);
  log(`\nSupabase Auth users (will ALL be deleted): ${authUsers.length}`);
  for (const u of authUsers) {
    log(`  - ${u.email ?? "(no email)"} (${u.id})`);
  }

  log("\nAfter wipe: NO accounts seeded — beta is completely empty.");
}

async function verifyEmpty(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  log("\n=== Post-wipe verification (empty beta) ===");

  const { total } = await countAllTables(p);
  const prismaUserCount = await p.user.count();
  const authUsers = await listAllAuthUsers(admin);

  const checks: { label: string; ok: boolean; detail: string }[] = [
    { label: "Prisma User count = 0", ok: prismaUserCount === 0, detail: String(prismaUserCount) },
    { label: "Supabase Auth count = 0", ok: authUsers.length === 0, detail: String(authUsers.length) },
    { label: "All app table rows = 0", ok: total === 0, detail: String(total) },
    {
      label: "Listings = 0",
      ok: (await p.listing.count()) === 0,
      detail: String(await p.listing.count()),
    },
    {
      label: "Live rooms = 0",
      ok: (await p.liveRoom.count()) === 0,
      detail: String(await p.liveRoom.count()),
    },
    {
      label: "Orders = 0",
      ok: (await p.order.count()) === 0,
      detail: String(await p.order.count()),
    },
    {
      label: "Bids = 0",
      ok: (await p.bid.count()) === 0,
      detail: String(await p.bid.count()),
    },
    {
      label: "Addresses = 0",
      ok: (await p.address.count()) === 0,
      detail: String(await p.address.count()),
    },
    {
      label: "Chats = 0",
      ok:
        (await p.message.count()) === 0 &&
        (await p.messageThread.count()) === 0 &&
        (await p.liveRoomMessage.count()) === 0,
      detail: `${await p.message.count()} DMs, ${await p.messageThread.count()} threads, ${await p.liveRoomMessage.count()} live`,
    },
  ];

  const base = BETA_API.replace(/\/+$/, "");
  const [pubRes, liveRes] = await Promise.all([
    fetch(`${base}/api/listings?scope=published`, { cache: "no-store" }),
    fetch(`${base}/api/live-rooms`, { cache: "no-store" }),
  ]);
  const pub = pubRes.ok ? await pubRes.json() : { listings: null };
  const live = liveRes.ok ? await liveRes.json() : { rooms: null };
  const pubCount = Array.isArray(pub.listings) ? pub.listings.length : -1;
  const liveCount = Array.isArray(live.rooms) ? live.rooms.length : -1;

  checks.push({
    label: "API published listings = []",
    ok: pubCount === 0,
    detail: String(pubCount),
  });
  checks.push({
    label: "API live rooms = []",
    ok: liveCount === 0,
    detail: String(liveCount),
  });

  let allPass = true;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) allPass = false;
    log(`  [${mark}] ${c.label} — ${c.detail}`);
  }

  if (allPass) log("\n✓ Beta is completely empty. Begin manual signup/setup from zero.");
  else {
    log("\n✗ Verification failed.");
    process.exitCode = 1;
  }
}

async function main() {
  const { supabaseUrl, serviceKey, dbRef } = assertBetaFullWipeAllowed({ noSeed: true });
  printBetaWipeBanner(dryRun, true);

  const p = createPostgresPrismaClient(resolveDatabaseUrl());
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(`Database project ref: ${dbRef}`);
  log(`Deployed API host:    ${BETA_API}\n`);

  await printInventory(p, admin);

  if (dryRun) {
    log("\nSQL that would run:");
    log(betaTruncateSql());
    log("\nRe-run without --dry-run to execute empty wipe.");
    await p.$disconnect();
    return;
  }

  log("\nPhase 1 — TRUNCATE all application tables …");
  await p.$executeRawUnsafe(betaTruncateSql());
  log("  done");

  log("Phase 2 — delete ALL Supabase Auth users …");
  await deleteAllSupabaseAuthUsers(admin, log);

  log("Phase 3 — skip seed (empty beta)");

  await verifyEmpty(p, admin);
  log("\nNext: sign up manually on beta — account creation, seller/buyer setup, Stripe, listings, live.");

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
