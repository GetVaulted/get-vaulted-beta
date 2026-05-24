/**
 * COMPLETE beta wipe for launch simulation (Supabase xkaaicokjgmpbctfermj ONLY).
 *
 * Deletes ALL application data + ALL Supabase Auth users, then seeds fresh sellerqa/buyerqa.
 *
 * Safety (all required):
 *   CONFIRM_BETA_FULL_WIPE=1
 *   ALLOW_BETA_QA_SEED=1
 *   DATABASE_URL + SUPABASE service role must target project xkaaicokjgmpbctfermj
 *
 * Usage (from web/):
 *   CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full -- --dry-run
 *   CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BETA_QA_BUYER_EMAIL,
  BETA_QA_SELLER_EMAIL,
  EXPECTED_BETA_PROJECT_REF,
} from "../src/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";
import { BETA_APP_COUNT_DELEGATES, betaTruncateSql } from "./lib/beta-app-tables";
import {
  deleteAllSupabaseAuthUsers,
  listAllAuthUsers,
  qaPassword,
  seedFreshBetaQaAccounts,
} from "./lib/beta-qa-provision";
import { assertBetaFullWipeAllowed, printBetaWipeBanner } from "./lib/beta-wipe-guards";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const dryRun = process.argv.includes("--dry-run");

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
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

async function printDryRunInventory(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  log("Current row counts (will ALL be deleted):");
  const { rows, total } = await countAllTables(p);
  for (const { table, count } of rows) {
    if (count > 0) {
      log(`  ${table.padEnd(28)} ${count}`);
    }
  }
  log(`  ${"TOTAL".padEnd(28)} ${total}`);

  const authUsers = await listAllAuthUsers(admin);
  log(`\nSupabase Auth users (will ALL be deleted): ${authUsers.length}`);
  for (const u of authUsers.slice(0, 30)) {
    log(`  - ${u.email ?? "(no email)"} (${u.id})`);
  }
  if (authUsers.length > 30) {
    log(`  … and ${authUsers.length - 30} more`);
  }

  log("\nSQL that would run:");
  log(betaTruncateSql());

  log("\nAfter wipe, would seed:");
  log(`  ${BETA_QA_SELLER_EMAIL} (seller, Stripe snapshot ready)`);
  log(`  ${BETA_QA_BUYER_EMAIL} (buyer, shipping + test card)`);
  log(`  Password: ${qaPassword()}`);
}

async function wipeAllPrismaData(p: ReturnType<typeof createPostgresPrismaClient>) {
  log("Phase 1 — TRUNCATE all application tables …");
  await p.$executeRawUnsafe(betaTruncateSql());
  log("  all Prisma application tables truncated");
}

async function verifyCleanBeta(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  log("\n=== Post-wipe verification ===");

  const checks: { label: string; ok: boolean; detail: string }[] = [];

  const users = await p.user.findMany({ select: { email: true, username: true } });
  const onlyCanonical =
    users.length === 2 &&
    users.every(
      (u) =>
        u.email.toLowerCase() === BETA_QA_SELLER_EMAIL ||
        u.email.toLowerCase() === BETA_QA_BUYER_EMAIL,
    );
  checks.push({
    label: "Only sellerqa + buyerqa exist in Prisma",
    ok: onlyCanonical,
    detail: users.map((u) => u.email).join(", ") || "(none)",
  });

  const seller = await p.user.findFirst({
    where: { email: { equals: BETA_QA_SELLER_EMAIL, mode: "insensitive" } },
    select: {
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      shipFromStreet: true,
    },
  });
  checks.push({
    label: "Seller Stripe snapshot + ship-from ready",
    ok: Boolean(
      seller?.stripeOnboardingComplete && seller?.stripeChargesEnabled && seller?.shipFromStreet,
    ),
    detail: seller ? "ready" : "missing",
  });

  const listingCount = await p.listing.count();
  checks.push({
    label: "Marketplace / seller inventory empty",
    ok: listingCount === 0,
    detail: `${listingCount} listing(s)`,
  });

  const roomCount = await p.liveRoom.count();
  checks.push({
    label: "Live rooms empty",
    ok: roomCount === 0,
    detail: `${roomCount} room(s)`,
  });

  const orderCount = await p.order.count();
  checks.push({
    label: "Orders empty",
    ok: orderCount === 0,
    detail: `${orderCount} order(s)`,
  });

  const bidCount = await p.bid.count();
  checks.push({
    label: "Bids empty",
    ok: bidCount === 0,
    detail: `${bidCount} bid(s)`,
  });

  const msgCount = await p.message.count();
  const threadCount = await p.messageThread.count();
  const liveMsgCount = await p.liveRoomMessage.count();
  checks.push({
    label: "Chats empty (DM + live)",
    ok: msgCount === 0 && threadCount === 0 && liveMsgCount === 0,
    detail: `${msgCount} DMs, ${threadCount} threads, ${liveMsgCount} live msgs`,
  });

  const notifCount = await p.notification.count();
  checks.push({
    label: "Notifications empty",
    ok: notifCount === 0,
    detail: `${notifCount} notification(s)`,
  });

  const buyer = await p.user.findFirst({
    where: { email: { equals: BETA_QA_BUYER_EMAIL, mode: "insensitive" } },
    select: { _count: { select: { addresses: true, orders: true, bids: true } } },
  });
  checks.push({
    label: "Buyer has shipping address, no orders/bids",
    ok: (buyer?._count.addresses ?? 0) >= 1 && buyer?._count.orders === 0 && buyer?._count.bids === 0,
    detail: `addresses=${buyer?._count.addresses ?? 0} orders=${buyer?._count.orders ?? 0} bids=${buyer?._count.bids ?? 0}`,
  });

  const authUsers = await listAllAuthUsers(admin);
  const authOk =
    authUsers.length === 2 &&
    authUsers.every(
      (u) =>
        u.email?.toLowerCase() === BETA_QA_SELLER_EMAIL ||
        u.email?.toLowerCase() === BETA_QA_BUYER_EMAIL,
    );
  checks.push({
    label: "Only sellerqa + buyerqa in Supabase Auth",
    ok: authOk,
    detail: authUsers.map((u) => u.email).join(", ") || "(none)",
  });

  let allPass = true;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) allPass = false;
    log(`  [${mark}] ${c.label} — ${c.detail}`);
  }

  log(allPass ? "\n✓ Beta is clean and ready for launch simulation." : "\n✗ Verification failed — inspect above.");
  return allPass;
}

const BETA_API_BASE =
  process.env.BETA_API_BASE_URL?.trim() ||
  process.env.SMOKE_BASE_URL?.trim() ||
  "https://beta.shopgetvaulted.com";

async function fetchDeployedCatalogCounts(): Promise<{ published: number; liveRooms: number; titles: string[] }> {
  const base = BETA_API_BASE.replace(/\/+$/, "");
  try {
    const [pubRes, liveRes] = await Promise.all([
      fetch(`${base}/api/listings?scope=published`, { cache: "no-store" }),
      fetch(`${base}/api/live-rooms`, { cache: "no-store" }),
    ]);
    const pub = pubRes.ok ? await pubRes.json() : { listings: [] };
    const live = liveRes.ok ? await liveRes.json() : { rooms: [] };
    const listings = Array.isArray(pub.listings) ? pub.listings : [];
    const rooms = Array.isArray(live.rooms) ? live.rooms : [];
    return {
      published: listings.length,
      liveRooms: rooms.length,
      titles: listings.slice(0, 5).map((l: { title?: string }) => l.title ?? "?"),
    };
  } catch {
    return { published: -1, liveRooms: -1, titles: [] };
  }
}

async function verifyDeployedApiClean(logFn: (msg: string) => void): Promise<boolean> {
  logFn("\n=== Deployed beta API check (beta.shopgetvaulted.com) ===");
  const { published, liveRooms, titles } = await fetchDeployedCatalogCounts();
  if (published < 0) {
    logFn("  skip — could not reach deployed beta API");
    return true;
  }
  const ok = published === 0 && liveRooms === 0;
  logFn(`  published listings: ${published}${titles.length ? ` (e.g. ${titles.join(", ")})` : ""}`);
  logFn(`  live rooms: ${liveRooms}`);
  if (!ok) {
    logFn("\n  ✗ Deployed beta still has catalog rows.");
    logFn("  Your DATABASE_URL may not match Netlify beta. Compare refs with npm run verify:beta-env");
    logFn("  Emergency API cleanup: node scripts/purge-beta-catalog-via-api.mjs");
  } else {
    logFn("  ✓ Deployed API catalog is empty");
  }
  return ok;
}

async function main() {
  const { supabaseUrl, serviceKey, dbRef } = assertBetaFullWipeAllowed();
  printBetaWipeBanner(dryRun);

  const dbUrl = resolveDatabaseUrl();
  const p = createPostgresPrismaClient(dbUrl);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(`Database project ref: ${dbRef}`);
  log(`Supabase URL ref:     ${EXPECTED_BETA_PROJECT_REF}`);
  log(`Deployed API host:    ${BETA_API_BASE}`);
  log("");

  const remoteBefore = await fetchDeployedCatalogCounts();
  if (remoteBefore.published >= 0) {
    log(`Deployed beta BEFORE wipe: ${remoteBefore.published} published listing(s), ${remoteBefore.liveRooms} live room(s)`);
    if (remoteBefore.titles.length) log(`  examples: ${remoteBefore.titles.join(", ")}`);
    log("");
  }

  if (dryRun) {
    await printDryRunInventory(p, admin);
    log("\nRe-run without --dry-run to execute wipe + seed.");
    await p.$disconnect();
    return;
  }

  await printDryRunInventory(p, admin);
  log("");

  await wipeAllPrismaData(p);
  log("Phase 2 — delete ALL Supabase Auth users …");
  await deleteAllSupabaseAuthUsers(admin, log);

  log("Phase 3 — seed fresh sellerqa + buyerqa …");
  await seedFreshBetaQaAccounts(p, admin, log);

  await verifyCleanBeta(p, admin);
  const remoteOk = await verifyDeployedApiClean(log);
  if (!remoteOk) {
    process.exitCode = 1;
  }

  log("\n=== Fresh beta QA accounts ===");
  log(`Password: ${qaPassword()}`);
  log(`Seller: ${BETA_QA_SELLER_EMAIL}`);
  log(`Buyer:  ${BETA_QA_BUYER_EMAIL}`);
  log("\nClear QA session on all clients, sign in fresh, then use web/docs/launch-readiness-checklist.md");

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
