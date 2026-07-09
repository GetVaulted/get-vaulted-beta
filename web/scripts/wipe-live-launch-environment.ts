/**
 * Go-live fresh start — clears ALL commerce/app data, keeps selected Supabase Auth accounts.
 *
 * Use before production launch when beta test data should be removed but specific accounts
 * (e.g. Apple App Review tester) must remain sign-in-able.
 *
 * Admin + Get Vaulted sales accounts can be created manually in Supabase after the wipe.
 *
 * Safety (all required):
 *   CONFIRM_LIVE_LAUNCH_WIPE=1
 *   CONFIRM_LIVE_LAUNCH_WIPE_FINAL=xkaaicokjgmpbctfermj
 *   PRESERVE_AUTH_EMAILS="reviewer@example.com"   (comma-separated)
 *
 * Usage (from web/):
 *   CONFIRM_LIVE_LAUNCH_WIPE=1 CONFIRM_LIVE_LAUNCH_WIPE_FINAL=xkaaicokjgmpbctfermj PRESERVE_AUTH_EMAILS="..." npm run qa:wipe-live-launch -- --dry-run
 *   CONFIRM_LIVE_LAUNCH_WIPE=1 CONFIRM_LIVE_LAUNCH_WIPE_FINAL=xkaaicokjgmpbctfermj PRESERVE_AUTH_EMAILS="..." npm run qa:wipe-live-launch
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";
import { BETA_APP_COUNT_DELEGATES, BETA_PRESERVE_TABLES, betaTruncateSql } from "./lib/beta-app-tables";
import {
  deleteSupabaseAuthUsersExcept,
  listAllAuthUsers,
} from "./lib/supabase-auth-admin";
import {
  assertLiveLaunchWipeAllowed,
  printLiveLaunchWipeBanner,
} from "./lib/live-launch-wipe-guards";

const dryRun = process.argv.includes("--dry-run");

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

function baseUsernameFromAuthUser(user: SupabaseAuthUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.username === "string" ? meta.username.trim().toLowerCase() : "";
  if (raw && /^[a-zA-Z0-9_]{3,20}$/.test(raw)) return raw.slice(0, 20);
  const local = user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() ?? "";
  const cleaned = local.replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (cleaned.length >= 3) return cleaned.slice(0, 20);
  return `user_${user.id.replace(/-/g, "").slice(0, 12)}`;
}

async function allocateUsername(p: PrismaClient, base: string): Promise<string> {
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "user";
  const stem = sanitized.slice(0, 17);
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? stem.slice(0, 20) : `${stem}_${i}`.slice(0, 20);
    if (candidate.length < 3) continue;
    const taken = await p.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `u_${Date.now()}`.slice(0, 20);
}

async function bootstrapPreservedPrismaUser(p: PrismaClient, authUser: SupabaseAuthUser): Promise<string> {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error(`Preserved auth user ${authUser.id} has no email`);

  const existing = await p.user.findUnique({ where: { id: authUser.id }, select: { id: true } });
  if (existing) return existing.id;

  const meta = authUser.user_metadata as Record<string, unknown> | undefined;
  const displayRaw = meta?.display_name;
  const display =
    typeof displayRaw === "string" && displayRaw.trim() ? displayRaw.trim().slice(0, 120) : null;
  const username = await allocateUsername(p, baseUsernameFromAuthUser(authUser));
  const emailVerifiedAt = authUser.email_confirmed_at
    ? new Date(authUser.email_confirmed_at)
    : new Date();

  const created = await p.user.create({
    data: {
      id: authUser.id,
      email,
      username,
      name: display,
      emailVerified: emailVerifiedAt,
    },
  });
  return created.id;
}

async function listAllAuthUsersFull(admin: ReturnType<typeof createClient>): Promise<SupabaseAuthUser[]> {
  const all: SupabaseAuthUser[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    all.push(...users);
    if (users.length < 500) break;
    page += 1;
  }
  return all;
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
  admin: ReturnType<typeof createClient>,
  preserveEmails: ReadonlySet<string>,
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

  const authUsers = await listAllAuthUsers(admin);
  const toDelete = authUsers.filter((u) => !preserveEmails.has((u.email ?? "").toLowerCase()));
  const toKeep = authUsers.filter((u) => preserveEmails.has((u.email ?? "").toLowerCase()));

  log("");
  log(`Supabase Auth users: ${authUsers.length} total`);
  log(`  KEEP (${toKeep.length}):`);
  for (const u of toKeep) {
    log(`    - ${u.email ?? "(no email)"}`);
  }
  if (toKeep.length < preserveEmails.size) {
    const found = new Set(toKeep.map((u) => (u.email ?? "").toLowerCase()));
    for (const email of preserveEmails) {
      if (!found.has(email)) log(`    ! NOT FOUND: ${email}`);
    }
  }
  log(`  DELETE (${toDelete.length}):`);
  for (const u of toDelete.slice(0, 25)) {
    log(`    - ${u.email ?? "(no email)"}`);
  }
  if (toDelete.length > 25) log(`    … and ${toDelete.length - 25} more`);
}

async function bootstrapPreservedPrismaUsers(
  p: PrismaClient,
  admin: ReturnType<typeof createClient>,
  preserveEmails: ReadonlySet<string>,
) {
  const authUsers = await listAllAuthUsersFull(admin);
  const kept = authUsers.filter((u) => preserveEmails.has((u.email ?? "").toLowerCase()));
  log(`Phase 4 — bootstrap ${kept.length} preserved Prisma User row(s) …`);
  for (const authUser of kept) {
    const id = await bootstrapPreservedPrismaUser(p, authUser);
    log(`  ${authUser.email ?? authUser.id} → Prisma user ${id}`);
  }
}

async function verifyPostWipe(
  p: ReturnType<typeof createPostgresPrismaClient>,
  admin: ReturnType<typeof createClient>,
  preserveEmails: ReadonlySet<string>,
) {
  log("\n=== Post-wipe verification ===");

  const { clearTotal } = await countAllTables(p);
  const prismaUserCount = await p.user.count();
  const authUsers = await listAllAuthUsers(admin);
  const keptAuth = authUsers.filter((u) => preserveEmails.has((u.email ?? "").toLowerCase()));
  const expectedUserRows = keptAuth.length;
  const commerceRowCount = clearTotal - prismaUserCount + expectedUserRows;

  const checks: { label: string; ok: boolean; detail: string }[] = [
    {
      label: "Commerce/app row count = 0 (excluding preserved users)",
      ok: commerceRowCount === 0,
      detail: String(commerceRowCount),
    },
    {
      label: "Prisma User count = preserved auth count",
      ok: prismaUserCount === keptAuth.length,
      detail: `${prismaUserCount} (expected ${keptAuth.length})`,
    },
    {
      label: "Supabase Auth count = preserved count",
      ok: authUsers.length === keptAuth.length,
      detail: `${authUsers.length} (expected ${keptAuth.length})`,
    },
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
  ];

  let allPass = true;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) allPass = false;
    log(`  [${mark}] ${c.label} — ${c.detail}`);
  }

  if (allPass) {
    log("\n✓ Database cleared for go-live. Create admin + Get Vaulted sales in Supabase next.");
  } else {
    log("\n✗ Verification failed.");
    process.exitCode = 1;
  }
}

async function main() {
  const { supabaseUrl, serviceKey, dbRef, preserveEmails } = assertLiveLaunchWipeAllowed();
  const preserveSet = new Set(preserveEmails);
  printLiveLaunchWipeBanner(dryRun, preserveEmails);

  const p = createPostgresPrismaClient(resolveDatabaseUrl());
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(`Database project ref: ${dbRef}\n`);
  await printInventory(p, admin, preserveSet);

  if (dryRun) {
    log("\nSQL that would run:");
    log(betaTruncateSql());
    log("\nRe-run without --dry-run to execute live launch wipe.");
    await p.$disconnect();
    return;
  }

  log("\nPhase 1 — TRUNCATE all application tables …");
  await p.$executeRawUnsafe(betaTruncateSql());
  log("  done");

  log("Phase 2 — delete non-preserved Supabase Auth users …");
  await deleteSupabaseAuthUsersExcept(admin, preserveSet, log);

  log("Phase 3 — skip seed (create admin + sales manually in Supabase)");
  await bootstrapPreservedPrismaUsers(p, admin, preserveSet);

  await verifyPostWipe(p, admin, preserveSet);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
