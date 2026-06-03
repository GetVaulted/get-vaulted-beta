/**
 * Safe beta-only QA slate reset — empty marketplace, live, orders, messages, etc.
 * Preserves schema, migrations, TaxNexusState, and env config (Stripe/AWS are not in DB).
 *
 * Usage (from web/):
 *   npx tsx scripts/reset-beta-qa-slate.ts --dry-run
 *   npx tsx scripts/reset-beta-qa-slate.ts --dry-run --seed
 *
 * Live wipe (empty beta):
 *   CONFIRM_RESET_BETA=YES npx tsx scripts/reset-beta-qa-slate.ts
 *
 * Live wipe + admin/seller/buyer seed:
 *   CONFIRM_RESET_BETA=YES npx tsx scripts/reset-beta-qa-slate.ts --seed
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BETA_QA_ADMIN_EMAIL,
  BETA_QA_BUYER_EMAIL,
  BETA_QA_SELLER_EMAIL,
} from "../src/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import {
  BETA_APP_COUNT_DELEGATES,
  BETA_PRESERVE_TABLES,
  betaTruncateSql,
} from "./lib/beta-app-tables";
import {
  assertBetaSlateResetAllowed,
  verifyBetaApiAligned,
} from "./lib/beta-slate-reset-guards";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const dryRun = process.argv.includes("--dry-run");
const seed = process.argv.includes("--seed");
const skipApiCheck = process.argv.includes("--skip-api-check");
const live = !dryRun;

async function loadProvision() {
  return import("./lib/beta-qa-provision");
}

function qaPasswordHint(): string {
  return (
    process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ||
    process.env.BETA_QA_PASSWORD?.trim() ||
    "VaultedBetaQA1!"
  );
}

function adminPasswordHint(): string {
  return process.env.BETA_QA_ADMIN_PASSWORD?.trim() || "AdminBeta123!";
}

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

async function countAllTables(p: ReturnType<typeof createPostgresPrismaClient>) {
  const rows: { table: string; count: number; preserve?: boolean }[] = [];
  let clearTotal = 0;
  let preserveTotal = 0;
  for (const { table, delegate, preserve } of BETA_APP_COUNT_DELEGATES) {
    const model = (p as Record<string, { count: () => Promise<number> }>)[delegate];
    const count = model ? await model.count() : 0;
    rows.push({ table, count, preserve });
    if (preserve) preserveTotal += count;
    else clearTotal += count;
  }
  return { rows, clearTotal, preserveTotal };
}

async function printInventory(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient> | null,
) {
  log("Row counts — tables to CLEAR:");
  const { rows, clearTotal, preserveTotal } = await countAllTables(p);
  for (const { table, count, preserve } of rows) {
    if (preserve) continue;
    log(`  ${table.padEnd(32)} ${count}`);
  }
  log(`  ${"SUBTOTAL".padEnd(32)} ${clearTotal}`);

  log("");
  log("Row counts — tables to PRESERVE:");
  for (const t of BETA_PRESERVE_TABLES) {
    const row = rows.find((r) => r.table === t);
    log(`  ${t.padEnd(32)} ${row?.count ?? 0}`);
  }
  log(`  ${"SUBTOTAL".padEnd(32)} ${preserveTotal}`);

  if (admin) {
    const { listAllAuthUsers } = await loadProvision();
    const authUsers = await listAllAuthUsers(admin);
    log("");
    log(`Supabase Auth users (deleted on live wipe): ${authUsers.length}`);
    for (const u of authUsers.slice(0, 15)) {
      log(`  - ${u.email ?? "(no email)"}`);
    }
    if (authUsers.length > 15) log(`  … and ${authUsers.length - 15} more`);
  } else {
    log("");
    log("Supabase Auth: service role not configured — Auth wipe skipped locally.");
  }

  log("");
  log("Wipe plan (single transaction):");
  log("  BEGIN;");
  log(`  ${betaTruncateSql().split("\n").join("\n  ")}`);
  log("  COMMIT;");
  log("  → delete all Supabase Auth users");
  if (seed) {
    log("  → seed adminqa + sellerqa + buyerqa");
    log(`     admin:  ${BETA_QA_ADMIN_EMAIL}  password: ${adminPasswordHint()}`);
    log(`     seller: ${BETA_QA_SELLER_EMAIL}  password: ${qaPasswordHint()}`);
    log(`     buyer:  ${BETA_QA_BUYER_EMAIL}  password: ${qaPasswordHint()}`);
  } else {
    log("  → no seed (empty beta)");
  }
}

async function verifyEmptySlate(p: ReturnType<typeof createPostgresPrismaClient>, withSeed: boolean) {
  const checks: Array<{ label: string; count: number }> = [
    { label: "listings", count: await p.listing.count() },
    { label: "live rooms", count: await p.liveRoom.count() },
    { label: "orders", count: await p.order.count() },
    { label: "bids", count: await p.bid.count() },
    { label: "offers", count: await p.offer.count() },
    { label: "trade offers", count: await p.tradeOffer.count() },
    { label: "messages", count: await p.message.count() },
    { label: "notifications", count: await p.notification.count() },
  ];
  const failures = checks.filter((c) => c.count > 0);
  if (failures.length > 0) {
    throw new Error(
      `Post-reset verification failed: ${failures.map((f) => `${f.label}=${f.count}`).join(", ")}`,
    );
  }

  const userCount = await p.user.count();
  if (withSeed) {
    if (userCount !== 3) {
      throw new Error(`Expected 3 seeded users, got ${userCount}`);
    }
  } else if (userCount > 0) {
    throw new Error(`Expected 0 users after empty wipe, got ${userCount}`);
  }
  log("Post-reset verification: marketplace empty ✓");
}

async function executeWipe(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  const { deleteAllSupabaseAuthUsers, seedBetaQaSlateAccounts } = await loadProvision();
  log("Phase 1 — TRUNCATE application tables (transaction) …");
  await p.$executeRawUnsafe("BEGIN;");
  try {
    await p.$executeRawUnsafe(betaTruncateSql());
    await p.$executeRawUnsafe("COMMIT;");
  } catch (e) {
    await p.$executeRawUnsafe("ROLLBACK;");
    throw e;
  }
  log("  Truncated all app tables (incl. live rooms, OBS tokens, IVS refs, orders, chats)");

  log("Phase 2 — delete ALL Supabase Auth users …");
  await deleteAllSupabaseAuthUsers(admin, log);

  if (seed) {
    log("Phase 3 — seed admin + seller + buyer QA accounts …");
    await seedBetaQaSlateAccounts(p, admin, log);
  } else {
    log("Phase 3 — skipped (no --seed)");
  }
}

async function main() {
  const target = assertBetaSlateResetAllowed({ live, seed });

  if (!skipApiCheck) {
    const apiOk = await verifyBetaApiAligned();
    if (!apiOk && live) {
      console.error("Refusing live wipe: beta API not aligned. Use --skip-api-check to override locally.");
      process.exit(1);
    }
    if (!apiOk) {
      log("Warning: beta API alignment check failed (dry-run continues).");
    }
  }

  const p = createPostgresPrismaClient(target.dbUrl);
  const admin =
    target.supabaseUrl && target.serviceKey
      ? createClient(target.supabaseUrl, target.serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  await printInventory(p, admin);

  if (dryRun) {
    log("");
    log("Dry run complete — no changes made.");
    log("Live wipe: CONFIRM_RESET_BETA=YES npx tsx scripts/reset-beta-qa-slate.ts [--seed]");
    await p.$disconnect();
    return;
  }

  if (!admin) {
    console.error("Refusing live wipe: SUPABASE_SERVICE_ROLE_KEY required for Auth cleanup.");
    process.exit(1);
  }

  log("");
  log("Executing live wipe in 3 seconds …");
  await new Promise((r) => setTimeout(r, 3000));

  await executeWipe(p, admin);
  await verifyEmptySlate(p, seed);

  log("");
  log("=== Beta QA slate reset complete ===");
  if (seed) {
    log(`Admin:  ${BETA_QA_ADMIN_EMAIL}  /  ${adminPasswordHint()}`);
    log(`Seller: ${BETA_QA_SELLER_EMAIL}  /  ${qaPasswordHint()}`);
    log(`Buyer:  ${BETA_QA_BUYER_EMAIL}  /  ${qaPasswordHint()}`);
  } else {
    log("Beta is empty — create accounts manually or re-run with --seed.");
  }
  log("Clear browser sessions and reload the app.");

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
