/**
 * Remove Vitest integration test pollution from beta Postgres (*@test.internal users).
 * Does NOT touch sellerqa/buyerqa or real accounts.
 *
 * Requires:
 *   CONFIRM_BETA_INTEGRATION_PURGE=1
 *   DATABASE_URL → project xkaaicokjgmpbctfermj
 *
 * Usage:
 *   CONFIRM_BETA_INTEGRATION_PURGE=1 npx tsx scripts/purge-beta-integration-fixtures.ts
 *   CONFIRM_BETA_INTEGRATION_PURGE=1 npx tsx scripts/purge-beta-integration-fixtures.ts --dry-run
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTEGRATION_TEST_EMAIL_SUFFIX } from "../src/lib/demo-seed-sellers";
import { EXPECTED_BETA_PROJECT_REF } from "../src/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env"), quiet: true });
config({ path: path.join(__dirname, "..", ".env.local"), override: true, quiet: true });

const dryRun = process.argv.includes("--dry-run");

function assertEnv() {
  // Beta and production share the same Supabase project ref, so the ref check below cannot
  // distinguish them — check the site-URL env vars first and refuse if this looks like production.
  const prodHostVar = findProductionHostEnvVar();
  if (prodHostVar) {
    console.error(
      `Refusing: ${prodHostVar} looks like the production domain. This script never runs against production.`,
    );
    process.exit(1);
  }
  if (process.env.CONFIRM_BETA_INTEGRATION_PURGE !== "1") {
    console.error("Refusing: set CONFIRM_BETA_INTEGRATION_PURGE=1");
    process.exit(1);
  }
  const dbRef = supabaseProjectRefFromUrl(resolveDatabaseUrl());
  if (dbRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(`Refusing: DATABASE_URL must be beta ref ${EXPECTED_BETA_PROJECT_REF}, got ${dbRef ?? "?"}`);
    process.exit(1);
  }
}

async function main() {
  assertEnv();
  const p = createPostgresPrismaClient(resolveDatabaseUrl());

  const users = await p.user.findMany({
    where: { email: { endsWith: INTEGRATION_TEST_EMAIL_SUFFIX } },
    select: { id: true, email: true, username: true, _count: { select: { listings: true, liveRooms: true } } },
  });

  console.log(`${dryRun ? "[dry-run] " : ""}Found ${users.length} integration test user(s) (*${INTEGRATION_TEST_EMAIL_SUFFIX})`);
  for (const u of users) {
    console.log(
      `  - ${u.email} (@${u.username}) listings=${u._count.listings} rooms=${u._count.liveRooms}`,
    );
  }

  const fixedRooms = await p.liveRoom.findMany({
    where: { id: { startsWith: "itest_" } },
    select: { id: true, title: true, seller: { select: { email: true } } },
  });
  if (fixedRooms.length) {
    console.log(`\nFixed integration room ids: ${fixedRooms.map((r) => r.id).join(", ")}`);
  }

  if (dryRun) {
    await p.$disconnect();
    return;
  }

  if (users.length) {
    await p.user.deleteMany({ where: { email: { endsWith: INTEGRATION_TEST_EMAIL_SUFFIX } } });
    console.log(`Deleted ${users.length} integration user(s) (cascade listings/rooms).`);
  }

  const orphanRooms = await p.liveRoom.deleteMany({ where: { id: { startsWith: "itest_" } } });
  if (orphanRooms.count) console.log(`Deleted ${orphanRooms.count} orphan itest_* room(s).`);

  const published = await p.listing.count({
    where: { status: "active", buyingFormat: "buy_now", moderationRemovedAt: null },
  });
  console.log(`\nActive buy-now listings remaining: ${published}`);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
