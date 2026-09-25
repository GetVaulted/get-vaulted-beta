/**
 * Netlify / CI: run `prisma migrate deploy` against a URL suitable for DDL.
 * Tries DIRECT_URL first (non-pooled Supabase URI), then DATABASE_URL if auth fails.
 *
 * P3005 (non-empty DB + first migration): records the lexicographically first
 * migration as already applied, then retries deploy. Use only when the live
 * schema already matches that migration (see Prisma baselining docs).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const direct = process.env.DIRECT_URL?.trim();
const pooled = process.env.DATABASE_URL?.trim();

/** @type {{ label: string; url: string }[]} */
const candidates = [];
if (direct) candidates.push({ label: "DIRECT_URL", url: direct });
if (pooled && pooled !== direct) candidates.push({ label: "DATABASE_URL", url: pooled });

if (candidates.length === 0) {
  console.error("[prisma-migrate-deploy] Missing DATABASE_URL (and optional DIRECT_URL).");
  process.exit(1);
}

function firstMigrationName() {
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const names = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n !== "migration_lock.toml")
    .sort();
  return names[0] ?? null;
}

function isAuthFailure(combined) {
  return /P1000/i.test(combined) || /Authentication failed/i.test(combined);
}

/** Netlify often cannot reach Supabase direct `db.*.supabase.co` (IPv6). Fall back to pooler. */
function isUnreachable(combined) {
  return (
    /P1001/i.test(combined) ||
    /Can't reach database server/i.test(combined) ||
    /cannot connect/i.test(combined)
  );
}

function migrateDeploy(env, capture) {
  const opts = {
    env,
    shell: true,
    encoding: "utf-8",
    ...(capture ? { stdio: ["inherit", "pipe", "pipe"] } : { stdio: "inherit" }),
  };
  return spawnSync("npx", ["prisma", "migrate", "deploy"], opts);
}

function runMigrateForUrl(label, url) {
  const env = { ...process.env, DATABASE_URL: url };
  console.log(`[prisma-migrate-deploy] Trying ${label} for Prisma migrate deploy.`);

  let result = migrateDeploy(env, true);
  let combined = `${result.stderr ?? ""}${result.stdout ?? ""}`;

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    return { ok: true, authFailed: false, status: 0, combined };
  }

  const isP3005 =
    /P3005/i.test(combined) || /database schema is not empty/i.test(combined);

  if (!isP3005) {
    return { ok: false, authFailed: isAuthFailure(combined), status: result.status ?? 1, combined };
  }

  const baseline = firstMigrationName();
  if (!baseline) {
    console.error("[prisma-migrate-deploy] P3005 but no migration folder found under prisma/migrations.");
    return { ok: false, authFailed: false, status: 1, combined };
  }

  console.warn(
    `[prisma-migrate-deploy] P3005 (non-empty database). Marking "${baseline}" as applied, then retrying migrate deploy.`,
  );
  console.warn(
    "[prisma-migrate-deploy] If the DB schema does not match that migration, fix the database manually instead.",
  );

  const resolveResult = spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", baseline],
    { stdio: "inherit", env, shell: true },
  );

  if (resolveResult.status !== 0) {
    return { ok: false, authFailed: false, status: resolveResult.status ?? 1, combined };
  }

  result = migrateDeploy(env, false);
  combined = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  return {
    ok: result.status === 0,
    authFailed: isAuthFailure(combined),
    status: result.status === 0 ? 0 : result.status ?? 1,
    combined,
  };
}

for (let i = 0; i < candidates.length; i++) {
  const { label, url } = candidates[i];
  const outcome = runMigrateForUrl(label, url);
  if (outcome.ok) {
    console.log(`[prisma-migrate-deploy] Migrations applied successfully via ${label}.`);
    process.exit(0);
  }

  const hasFallback = i < candidates.length - 1;
  if ((outcome.authFailed || isUnreachable(outcome.combined ?? "")) && hasFallback) {
    console.warn(
      outcome.authFailed
        ? `[prisma-migrate-deploy] ${label} authentication failed (P1000). Falling back to next connection string.`
        : `[prisma-migrate-deploy] ${label} unreachable (P1001). Falling back to next connection string.`,
    );
    console.warn(
      "[prisma-migrate-deploy] On Netlify, set DIRECT_URL to Supabase Session pooler URI (IPv4, port 5432), not db.*.supabase.co.",
    );
    continue;
  }

  if (outcome.combined) {
    console.error(`[prisma-migrate-deploy] migrate deploy failed using ${label}.`);
  }
  process.exit(outcome.status);
}

process.exit(1);
