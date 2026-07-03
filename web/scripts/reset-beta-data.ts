/**
 * Safe beta-only fresh-start reset — clears all user/app data, preserves schema + system config.
 *
 * NEVER runs against production. Hard-allowlist: Supabase project xkaaicokjgmpbctfermj only.
 *
 * Usage (from web/):
 *   npx tsx scripts/reset-beta-data.ts --preflight
 *   npx tsx scripts/reset-beta-data.ts --dry-run
 *   npx tsx scripts/reset-beta-data.ts --dry-run --backup
 *
 * Live wipe (requires explicit two-step confirmation env vars):
 *   CONFIRM_BETA_DATA_RESET=1 \
 *   CONFIRM_BETA_DATA_RESET_FINAL=xkaaicokjgmpbctfermj \
 *   ALLOW_BETA_QA_SEED=1 \
 *   npx tsx scripts/reset-beta-data.ts
 *
 * Empty beta (no seed accounts):
 *   CONFIRM_BETA_DATA_RESET=1 \
 *   CONFIRM_BETA_DATA_RESET_FINAL=xkaaicokjgmpbctfermj \
 *   CONFIRM_BETA_EMPTY_WIPE=1 \
 *   npx tsx scripts/reset-beta-data.ts --no-seed
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BETA_QA_BUYER_EMAIL,
  BETA_QA_SELLER_EMAIL,
  EXPECTED_BETA_API_HOST,
  EXPECTED_BETA_PROJECT_REF,
} from "../src/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";
import {
  parseDatabaseConnectionInfo,
  redactDatabaseUrl,
  resolveDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "../src/lib/resolve-database-url";
import {
  BETA_APP_COUNT_DELEGATES,
  BETA_PRESERVE_TABLES,
  betaTruncateSql,
} from "./lib/beta-app-tables";
import { printBetaWipeBanner } from "./lib/beta-wipe-guards";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const preflight = process.argv.includes("--preflight");
const dryRun = process.argv.includes("--dry-run");
const wantBackup = process.argv.includes("--backup");
const noSeed = process.argv.includes("--no-seed");
const liveWipe = !preflight && !dryRun;

function qaPasswordHint(): string {
  return (
    process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ||
    process.env.BETA_QA_PASSWORD?.trim() ||
    "VaultedBetaQA1!"
  );
}

async function loadBetaQaProvision() {
  return import("./lib/beta-qa-provision");
}

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(preflight || dryRun ? `[${preflight ? "preflight" : "dry-run"}] ${msg}` : msg);
}

type BetaTargetEnv = {
  dbUrl: string;
  directUrl: string | null;
  dbRef: string;
  supabaseUrl: string;
  serviceKey: string;
};

function resolveDirectUrl(): string | null {
  const direct = process.env.DIRECT_URL?.trim();
  if (!direct) return null;
  if (!direct.startsWith("postgres://") && !direct.startsWith("postgresql://")) return null;
  return direct;
}

function resolveBetaApiHost(): string {
  return (
    process.env.BETA_API_BASE_URL?.trim() ||
    process.env.SMOKE_BASE_URL?.trim() ||
    EXPECTED_BETA_API_HOST
  ).replace(/\/+$/, "");
}

async function verifyBetaApiHost(): Promise<{ ok: boolean; host: string; projectRef: string | null; aligned: boolean }> {
  const host = resolveBetaApiHost();
  if (host !== EXPECTED_BETA_API_HOST.replace(/\/+$/, "")) {
    return { ok: false, host, projectRef: null, aligned: false };
  }
  try {
    const res = await fetch(`${host}/api/auth/config`, { cache: "no-store" });
    if (!res.ok) return { ok: false, host, projectRef: null, aligned: false };
    const body = (await res.json()) as { projectRef?: string; alignedWithBeta?: boolean };
    const projectRef = typeof body.projectRef === "string" ? body.projectRef : null;
    const aligned =
      projectRef === EXPECTED_BETA_PROJECT_REF && body.alignedWithBeta !== false;
    return { ok: aligned, host, projectRef, aligned };
  } catch {
    return { ok: false, host, projectRef: null, aligned: false };
  }
}

function assertBetaTarget(): BetaTargetEnv {
  // Beta and production share the same Supabase project ref, so the ref checks below cannot
  // distinguish them. Site-URL env vars are the real signal — refuse immediately if this looks
  // like a production environment, before touching the database at all.
  const prodHostVar = findProductionHostEnvVar();
  if (prodHostVar) {
    console.error(
      `Refusing: ${prodHostVar} looks like the production domain. This script never runs against production.`,
    );
    console.error(`Unset or correct ${prodHostVar} (should be beta.shopgetvaulted.com) and try again.`);
    process.exit(1);
  }

  let dbUrl: string;
  try {
    dbUrl = resolveDatabaseUrl();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const dbRef = supabaseProjectRefFromUrl(dbUrl);
  const directUrl = resolveDirectUrl();
  const directRef = directUrl ? supabaseProjectRefFromUrl(directUrl) : null;

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);

  console.log("");
  console.log("=".repeat(72));
  console.log("BETA DATABASE TARGET CHECK");
  console.log("=".repeat(72));

  const dbInfo = parseDatabaseConnectionInfo(dbUrl);
  console.log(`DATABASE_URL ref:     ${dbRef ?? "(unknown — REFUSING)"}`);
  console.log(`DATABASE_URL host:    ${dbInfo.host}`);
  console.log(`DATABASE_URL port:    ${dbInfo.port}`);
  console.log(`DATABASE_URL db:      ${dbInfo.database}`);
  console.log(`DATABASE_URL user:    ${dbInfo.user}`);
  console.log(`DATABASE_URL (redacted): ${redactDatabaseUrl(dbUrl)}`);

  if (directUrl) {
    const dInfo = parseDatabaseConnectionInfo(directUrl);
    console.log("");
    console.log(`DIRECT_URL ref:       ${directRef ?? "(unknown)"}`);
    console.log(`DIRECT_URL host:      ${dInfo.host}`);
    console.log(`DIRECT_URL db:        ${dInfo.database}`);
    console.log(`DIRECT_URL (redacted): ${redactDatabaseUrl(directUrl)}`);
  } else {
    console.log("");
    console.log("DIRECT_URL:           (not set — migrations use DATABASE_URL)");
  }

  console.log("");
  console.log(`SUPABASE_URL ref:     ${supaRef ?? "(missing)"}`);
  console.log(`Expected beta ref:    ${EXPECTED_BETA_PROJECT_REF}`);
  console.log(`API host (expected):  ${EXPECTED_BETA_API_HOST}`);
  console.log(`API host (local env): ${resolveBetaApiHost()}`);
  console.log(`Production host check: PASSED (no site-URL env var matched shopgetvaulted.com)`);
  console.log("=".repeat(72));
  console.log("");

  if (dbRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: DATABASE_URL project ref must be ${EXPECTED_BETA_PROJECT_REF}, got ${dbRef ?? "?"}.`,
    );
    console.error("This script NEVER runs against production or unknown databases.");
    process.exit(1);
  }
  if (directRef && directRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: DIRECT_URL project ref must be ${EXPECTED_BETA_PROJECT_REF}, got ${directRef}.`,
    );
    process.exit(1);
  }
  if (supaRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: SUPABASE_URL project ref must be ${EXPECTED_BETA_PROJECT_REF}, got ${supaRef ?? "?"}.`,
    );
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    if (liveWipe) {
      console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
      process.exit(1);
    }
    log("Warning: Supabase Auth wipe/seed skipped — service role not configured locally.");
  }

  return {
    dbUrl,
    directUrl,
    dbRef: dbRef!,
    supabaseUrl,
    serviceKey: serviceKey ?? "",
  };
}

function assertLiveWipeConfirmation(dbRef: string) {
  if (process.env.CONFIRM_BETA_DATA_RESET !== "1") {
    console.error("Refusing live wipe: set CONFIRM_BETA_DATA_RESET=1");
    process.exit(1);
  }
  const final = process.env.CONFIRM_BETA_DATA_RESET_FINAL?.trim() ?? "";
  if (final !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing live wipe: set CONFIRM_BETA_DATA_RESET_FINAL=${EXPECTED_BETA_PROJECT_REF}`,
    );
    console.error("This is the final confirmation gate before destructive reset.");
    process.exit(1);
  }
  if (!noSeed && process.env.ALLOW_BETA_QA_SEED !== "1") {
    console.error("Refusing: set ALLOW_BETA_QA_SEED=1 for post-wipe sellerqa/buyerqa seed.");
    console.error("Or pass --no-seed with CONFIRM_BETA_EMPTY_WIPE=1 for zero accounts.");
    process.exit(1);
  }
  if (noSeed && process.env.CONFIRM_BETA_EMPTY_WIPE !== "1") {
    console.error("Refusing: set CONFIRM_BETA_EMPTY_WIPE=1 when using --no-seed.");
    process.exit(1);
  }
  if (dbRef !== EXPECTED_BETA_PROJECT_REF) {
    process.exit(1);
  }
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

function printBackupInstructions(dbUrl: string, directUrl: string | null) {
  const source = directUrl ?? dbUrl;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = `beta-backup-${EXPECTED_BETA_PROJECT_REF}-${stamp}.sql`;
  console.log("");
  console.log("--- Backup (run BEFORE live wipe) ---");
  console.log("Recommended: Supabase Dashboard → Database → Backups (managed snapshot).");
  console.log("Or local pg_dump:");
  console.log(`  pg_dump "${redactDatabaseUrl(source).replace("***", "YOUR_PASSWORD")}" -Fc -f ${outfile}`);
  console.log("");
}

function runPgDumpIfRequested(dbUrl: string, directUrl: string | null): boolean {
  if (!wantBackup) return true;
  const source = directUrl ?? dbUrl;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(webRoot, `beta-backup-${EXPECTED_BETA_PROJECT_REF}-${stamp}.dump`);
  log(`Attempting pg_dump → ${outfile}`);
  const result = spawnSync("pg_dump", [source, "-Fc", "-f", outfile], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status === 0) {
    log(`Backup written: ${outfile}`);
    return true;
  }
  log("pg_dump failed or not installed — take a Supabase Dashboard backup before live wipe.");
  if (result.stderr) log(result.stderr.trim());
  return false;
}

async function printInventory(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient> | null,
) {
  log("Tables to CLEAR (user/app data):");
  const { rows, clearTotal, preserveTotal } = await countAllTables(p);
  for (const { table, count, preserve } of rows) {
    if (preserve) continue;
    if (count > 0) log(`  ${table.padEnd(32)} ${count}`);
  }
  log(`  ${"SUBTOTAL (clear)".padEnd(32)} ${clearTotal}`);

  log("");
  log("Tables to PRESERVE (system/config):");
  for (const t of BETA_PRESERVE_TABLES) {
    const row = rows.find((r) => r.table === t);
    log(`  ${t.padEnd(32)} ${row?.count ?? 0} row(s)`);
  }
  log(`  ${"SUBTOTAL (preserve)".padEnd(32)} ${preserveTotal}`);

  if (admin) {
    const { listAllAuthUsers } = await loadBetaQaProvision();
    const authUsers = await listAllAuthUsers(admin);
    log("");
    log(`Supabase Auth users (will ALL be deleted on live wipe): ${authUsers.length}`);
    for (const u of authUsers.slice(0, 20)) {
      log(`  - ${u.email ?? "(no email)"} (${u.id})`);
    }
    if (authUsers.length > 20) log(`  … and ${authUsers.length - 20} more`);
  }

  log("");
  log("SQL (single transaction on live wipe):");
  log("BEGIN;");
  log(betaTruncateSql());
  log("COMMIT;");

  if (!noSeed) {
    log("");
    log("After wipe, would seed:");
    log(`  ${BETA_QA_SELLER_EMAIL} (seller)`);
    log(`  ${BETA_QA_BUYER_EMAIL} (buyer)`);
    log(`  Password: ${qaPasswordHint()}`);
  } else {
    log("");
    log("After wipe: empty beta (--no-seed).");
  }
}

async function executeWipe(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
) {
  const { deleteAllSupabaseAuthUsers, seedFreshBetaQaAccounts } = await loadBetaQaProvision();
  log("Phase 1 — TRUNCATE application tables (transaction) …");
  await p.$executeRawUnsafe("BEGIN;");
  try {
    await p.$executeRawUnsafe(betaTruncateSql());
    await p.$executeRawUnsafe("COMMIT;");
  } catch (e) {
    await p.$executeRawUnsafe("ROLLBACK;");
    throw e;
  }
  log("  Prisma application tables truncated; sequences restarted");

  log("Phase 2 — delete ALL Supabase Auth users …");
  await deleteAllSupabaseAuthUsers(admin, log);

  if (!noSeed) {
    log("Phase 3 — seed fresh sellerqa + buyerqa …");
    await seedFreshBetaQaAccounts(p, admin, log);
  } else {
    log("Phase 3 — skipped (--no-seed)");
  }
}

async function main() {
  const target = assertBetaTarget();

  const apiCheck = await verifyBetaApiHost();
  console.log("Deployed API verification:");
  console.log(`  host:        ${apiCheck.host}`);
  console.log(`  projectRef:  ${apiCheck.projectRef ?? "(unreachable)"}`);
  console.log(`  aligned:     ${apiCheck.aligned ? "yes" : "no"}`);
  console.log("");
  if (!apiCheck.ok) {
    console.error(
      `Refusing: API host must be ${EXPECTED_BETA_API_HOST} with projectRef ${EXPECTED_BETA_PROJECT_REF}.`,
    );
    process.exit(1);
  }

  const p = createPostgresPrismaClient(target.dbUrl);
  const admin =
    target.supabaseUrl && target.serviceKey
      ? createClient(target.supabaseUrl, target.serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  if (preflight) {
    await printInventory(p, admin);
    printBackupInstructions(target.dbUrl, target.directUrl);
    log("");
    log("Preflight complete — no changes made.");
    log("Next: --dry-run, then live wipe with CONFIRM_BETA_DATA_RESET env vars.");
    await p.$disconnect();
    return;
  }

  if (dryRun) {
    printBetaWipeBanner(true, noSeed);
    await printInventory(p, admin);
    printBackupInstructions(target.dbUrl, target.directUrl);
    log("");
    log("Dry run complete — no changes made.");
    await p.$disconnect();
    return;
  }

  assertLiveWipeConfirmation(target.dbRef);
  printBetaWipeBanner(false, noSeed);

  await printInventory(p, admin);
  printBackupInstructions(target.dbUrl, target.directUrl);

  if (wantBackup && !runPgDumpIfRequested(target.dbUrl, target.directUrl)) {
    console.error("Refusing live wipe: backup failed. Fix pg_dump or use Supabase Dashboard backup.");
    process.exit(1);
  }

  if (!admin) {
    console.error("Refusing live wipe: Supabase service role required for Auth cleanup.");
    process.exit(1);
  }

  log("");
  log("Executing live wipe in 3 seconds …");
  await new Promise((r) => setTimeout(r, 3000));

  await executeWipe(p, admin);

  log("");
  log("=== Fresh beta reset complete ===");
  if (!noSeed) {
    log(`Password: ${qaPasswordHint()}`);
    log(`Seller: ${BETA_QA_SELLER_EMAIL}`);
    log(`Buyer:  ${BETA_QA_BUYER_EMAIL}`);
  }
  log("Clear client sessions, sign in fresh, then run IVS + commerce smoke tests.");

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
