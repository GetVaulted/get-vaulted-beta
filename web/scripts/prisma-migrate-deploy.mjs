/**
 * Netlify / CI: run `prisma migrate deploy` against a URL suitable for DDL.
 * When using Supabase's transaction pooler for `DATABASE_URL`, set `DIRECT_URL`
 * to the non-pooled Postgres URI (port 5432) so migrations can run; this script
 * prefers DIRECT_URL for the migrate/resolve subprocess only.
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
const migrateUrl = direct || pooled;

if (!migrateUrl) {
  console.error("[prisma-migrate-deploy] Missing DATABASE_URL (and optional DIRECT_URL).");
  process.exit(1);
}

console.log(
  `[prisma-migrate-deploy] Using ${direct ? "DIRECT_URL" : "DATABASE_URL"} for Prisma CLI (migrate / resolve).`,
);

const env = { ...process.env, DATABASE_URL: migrateUrl };

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

function migrateDeploy(capture) {
  const opts = {
    env,
    shell: true,
    encoding: "utf-8",
    ...(capture ? { stdio: ["inherit", "pipe", "pipe"] } : { stdio: "inherit" }),
  };
  return spawnSync("npx", ["prisma", "migrate", "deploy"], opts);
}

let result = migrateDeploy(true);

if (result.status === 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(0);
}

const combined = `${result.stderr ?? ""}${result.stdout ?? ""}`;
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const isP3005 =
  /P3005/i.test(combined) || /database schema is not empty/i.test(combined);

if (!isP3005) {
  process.exit(result.status ?? 1);
}

const baseline = firstMigrationName();
if (!baseline) {
  console.error("[prisma-migrate-deploy] P3005 but no migration folder found under prisma/migrations.");
  process.exit(1);
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
  process.exit(resolveResult.status ?? 1);
}

result = migrateDeploy(false);
process.exit(result.status === 0 ? 0 : result.status ?? 1);
