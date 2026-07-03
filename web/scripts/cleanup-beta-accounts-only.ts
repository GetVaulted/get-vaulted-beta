/**
 * Audit + delete all beta users except sellerqa / buyerqa (Prisma + Supabase Auth).
 *
 * Requires:
 *   CONFIRM_BETA_ACCOUNTS_ONLY=1
 *   ALLOW_BETA_QA_SEED=1
 *   DATABASE_URL + SUPABASE service role → xkaaicokjgmpbctfermj
 *
 * Usage:
 *   CONFIRM_BETA_ACCOUNTS_ONLY=1 ALLOW_BETA_QA_SEED=1 npm run qa:cleanup-beta-accounts -- --dry-run
 *   CONFIRM_BETA_ACCOUNTS_ONLY=1 ALLOW_BETA_QA_SEED=1 npm run qa:cleanup-beta-accounts
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

import { createClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  BETA_QA_BUYER_EMAIL,
  BETA_QA_SELLER_EMAIL,
  EXPECTED_BETA_PROJECT_REF,
  isCanonicalBetaQaEmail,
} from "../src/lib/beta-qa-scope";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../src/lib/resolve-database-url";

const dryRun = process.argv.includes("--dry-run");
const BETA_API =
  process.env.BETA_API_BASE_URL?.trim() ||
  process.env.SMOKE_BASE_URL?.trim() ||
  "https://beta.shopgetvaulted.com";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

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
  if (process.env.CONFIRM_BETA_ACCOUNTS_ONLY !== "1") {
    console.error("Refusing: set CONFIRM_BETA_ACCOUNTS_ONLY=1");
    process.exit(1);
  }
  if (process.env.ALLOW_BETA_QA_SEED !== "1") {
    console.error("Refusing: set ALLOW_BETA_QA_SEED=1");
    process.exit(1);
  }
  const dbRef = supabaseProjectRefFromUrl(resolveDatabaseUrl());
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);
  if (dbRef !== EXPECTED_BETA_PROJECT_REF || supaRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(`Refusing: expected project ref ${EXPECTED_BETA_PROJECT_REF} only.`);
    process.exit(1);
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return { supabaseUrl, serviceKey, dbRef };
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

async function purgeCommerceForUserIds(p: PrismaClient, userIds: string[]) {
  if (!userIds.length || dryRun) return;
  await p.liveBidIdempotency.deleteMany({ where: { userId: { in: userIds } } });
  await p.liveAuctionInventoryHold.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { listing: { sellerId: { in: userIds } } }] },
  });
  await p.liveAuctionProxyBid.deleteMany({ where: { userId: { in: userIds } } });
  await p.order.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
  await p.liveRoom.deleteMany({ where: { sellerId: { in: userIds } } });
  await p.tradeOffer.deleteMany({
    where: { OR: [{ proposerId: { in: userIds } }, { recipientId: { in: userIds } }] },
  });
  await p.listing.deleteMany({ where: { sellerId: { in: userIds } } });
  await p.bid.deleteMany({ where: { bidderId: { in: userIds } } });
  await p.offer.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
  await p.messageThread.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
  await p.notification.deleteMany({ where: { userId: { in: userIds } } });
  await p.address.deleteMany({ where: { userId: { in: userIds } } });
  await p.sellerCommerceEvent.deleteMany({ where: { sellerId: { in: userIds } } });
  await p.watchlistItem.deleteMany({ where: { userId: { in: userIds } } });
  await p.sellerFollow.deleteMany({
    where: { OR: [{ followerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
}

async function auditUsers(p: PrismaClient, admin: ReturnType<typeof createClient>) {
  const prismaUsers = await p.user.findMany({
    select: { id: true, email: true, username: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const authUsers = await listAllAuthUsers(admin);

  log(`\n=== BEFORE cleanup ===`);
  log(`Prisma User count: ${prismaUsers.length}`);
  for (const u of prismaUsers) {
    const tag = isCanonicalBetaQaEmail(u.email) ? "KEEP" : "REMOVE";
    log(`  [${tag}] prisma  ${u.email} (@${u.username}) id=${u.id}`);
  }

  log(`\nSupabase Auth count: ${authUsers.length}`);
  for (const u of authUsers) {
    const tag = isCanonicalBetaQaEmail(u.email) ? "KEEP" : "REMOVE";
    log(`  [${tag}] auth    ${u.email ?? "(no email)"} id=${u.id}`);
  }

  return { prismaUsers, authUsers };
}

async function cleanupNonCanonical(
  p: PrismaClient,
  admin: ReturnType<typeof createClient>,
  prismaUsers: { id: string; email: string }[],
  authUsers: { id: string; email: string | undefined }[],
) {
  const removePrisma = prismaUsers.filter((u) => !isCanonicalBetaQaEmail(u.email));
  const removeAuth = authUsers.filter((u) => !isCanonicalBetaQaEmail(u.email));

  if (dryRun) {
    log(`\nWould delete ${removePrisma.length} Prisma user(s), ${removeAuth.length} Auth user(s)`);
    return;
  }

  log(`\n=== Deleting non-canonical users ===`);
  const ids = removePrisma.map((u) => u.id);
  if (ids.length) {
    await purgeCommerceForUserIds(p, ids);
    const deleted = await p.user.deleteMany({ where: { id: { in: ids } } });
    log(`Deleted ${deleted.count} Prisma user(s)`);
  }

  for (const u of removeAuth) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email ?? u.id}: ${error.message}`);
    log(`Deleted Auth user ${u.email ?? u.id}`);
  }

  log(`\nEnsuring sellerqa + buyerqa exist …`);
  const { seedFreshBetaQaAccounts, qaPassword } = await import("./lib/beta-qa-provision");
  await seedFreshBetaQaAccounts(p, admin, log);
  log(`QA password: ${qaPassword()}`);
}

async function verifyFinal(p: PrismaClient, admin: ReturnType<typeof createClient>) {
  const prismaUsers = await p.user.findMany({
    select: { email: true, username: true },
    orderBy: { email: "asc" },
  });
  const authUsers = await listAllAuthUsers(admin);

  log(`\n=== AFTER cleanup ===`);
  log(`Prisma User count: ${prismaUsers.length}`);
  for (const u of prismaUsers) {
    log(`  ${u.email} (@${u.username})`);
  }
  log(`Supabase Auth count: ${authUsers.length}`);
  for (const u of authUsers) {
    log(`  ${u.email ?? "(no email)"}`);
  }

  const prismaOk =
    prismaUsers.length === 2 && prismaUsers.every((u) => isCanonicalBetaQaEmail(u.email));
  const authOk = authUsers.length === 2 && authUsers.every((u) => isCanonicalBetaQaEmail(u.email));

  log(`\nPrisma exactly 2 canonical: ${prismaOk ? "PASS" : "FAIL"}`);
  log(`Auth exactly 2 canonical: ${authOk ? "PASS" : "FAIL"}`);

  const base = BETA_API.replace(/\/+$/, "");
  const [pubRes, liveRes] = await Promise.all([
    fetch(`${base}/api/listings?scope=published`, { cache: "no-store" }),
    fetch(`${base}/api/live-rooms`, { cache: "no-store" }),
  ]);
  const pub = pubRes.ok ? await pubRes.json() : { listings: null };
  const live = liveRes.ok ? await liveRes.json() : { rooms: null };
  const pubCount = Array.isArray(pub.listings) ? pub.listings.length : -1;
  const liveCount = Array.isArray(live.rooms) ? live.rooms.length : -1;
  log(`API published listings: ${pubCount} ${pubCount === 0 ? "PASS" : "FAIL"}`);
  log(`API live rooms: ${liveCount} ${liveCount === 0 ? "PASS" : "FAIL"}`);

  const allPass = prismaOk && authOk && pubCount === 0 && liveCount === 0;
  if (!allPass) process.exitCode = 1;
  else log("\n✓ Beta has exactly sellerqa + buyerqa; catalog empty.");
}

async function main() {
  const { supabaseUrl, serviceKey, dbRef } = assertEnv();
  log(`Beta accounts-only cleanup (project ${dbRef})${dryRun ? " [DRY RUN]" : ""}`);

  const p = createPostgresPrismaClient(resolveDatabaseUrl());
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before = await auditUsers(p, admin);
  await cleanupNonCanonical(p, admin, before.prismaUsers, before.authUsers);
  if (!dryRun) await verifyFinal(p, admin);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
