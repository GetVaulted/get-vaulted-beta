/**
 * Bootstrap clean beta QA accounts in Supabase Auth + Prisma (project xkaaicokjgmpbctfermj).
 * Does NOT complete Stripe Connect — seller completes Seller Setup manually on device.
 *
 * Requires:
 *   ALLOW_BETA_QA_SEED=1
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL or INTEGRATION_DATABASE_URL (same Supabase project)
 *
 * Usage (from web/):
 *   ALLOW_BETA_QA_SEED=1 npx tsx scripts/seed-beta-qa-accounts.ts
 *   ALLOW_BETA_QA_SEED=1 npx tsx scripts/seed-beta-qa-accounts.ts --reset
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../src/lib/resolve-database-url";

const EXPECTED_REF = "xkaaicokjgmpbctfermj";

export const BETA_QA_SELLER_EMAIL = "sellerqa@getvaultedtest.com";
export const BETA_QA_BUYER_EMAIL = "buyerqa@getvaultedtest.com";
export const BETA_QA_SELLER_USERNAME = "sellerqa";
export const BETA_QA_BUYER_USERNAME = "buyerqa";

type QaAccountSpec = {
  email: string;
  username: string;
  displayName: string;
};

const ACCOUNTS: QaAccountSpec[] = [
  { email: BETA_QA_SELLER_EMAIL, username: BETA_QA_SELLER_USERNAME, displayName: "Seller QA" },
  { email: BETA_QA_BUYER_EMAIL, username: BETA_QA_BUYER_USERNAME, displayName: "Buyer QA" },
];

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
  if (process.env.ALLOW_BETA_QA_SEED !== "1") {
    console.error("Refusing to run. Set ALLOW_BETA_QA_SEED=1 in the environment.");
    process.exit(1);
  }

  const dbUrl = resolveDatabaseUrl();
  const dbRef = supabaseProjectRefFromUrl(dbUrl);
  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);
  if (dbRef !== EXPECTED_REF || supaRef !== EXPECTED_REF) {
    console.error(
      `Refusing to run: expected Supabase project ref ${EXPECTED_REF}, got db=${dbRef ?? "?"} supabase=${supaRef ?? "?"}.`,
    );
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in web/.env");
    process.exit(1);
  }

  return { dbUrl, supabaseUrl, serviceKey };
}

function qaPassword(): string {
  return process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() || "VaultedBetaQA1!";
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) throw new Error(error.message);
  const hit = (data.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return hit?.id ?? null;
}

async function deleteExistingAccount(prisma: PrismaClient, admin: SupabaseClient, spec: QaAccountSpec) {
  const authId = await findAuthUserIdByEmail(admin, spec.email);
  if (authId) {
    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error) throw new Error(`deleteUser ${spec.email}: ${error.message}`);
    console.log(`Deleted Supabase Auth user ${spec.email}`);
  }

  await prisma.user.deleteMany({
    where: {
      OR: [{ email: { equals: spec.email, mode: "insensitive" } }, { username: spec.username }],
    },
  });
}

async function createAccount(prisma: PrismaClient, admin: SupabaseClient, spec: QaAccountSpec) {
  const password = qaPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password,
    email_confirm: true,
    user_metadata: {
      username: spec.username,
      display_name: spec.displayName,
    },
  });
  if (error) throw new Error(`createUser ${spec.email}: ${error.message}`);
  const authId = data.user?.id;
  if (!authId) throw new Error(`No auth id for ${spec.email}`);

  const isSeller = spec.email === BETA_QA_SELLER_EMAIL;
  await prisma.user.create({
    data: {
      id: authId,
      email: spec.email.toLowerCase(),
      username: spec.username,
      name: spec.displayName,
      emailVerified: new Date(),
      shipFromName: isSeller ? "Seller QA Ship From" : undefined,
      shipFromStreet: isSeller ? "100 Beta QA Blvd" : undefined,
      shipFromCity: isSeller ? "Austin" : undefined,
      shipFromState: isSeller ? "TX" : undefined,
      shipFromZip: isSeller ? "78701" : undefined,
      shipFromCountry: isSeller ? "US" : undefined,
    },
  });

  console.log(`Created ${spec.email} (auth + Prisma User id=${authId})`);
  return authId;
}

async function main() {
  const reset = process.argv.includes("--reset");
  const { supabaseUrl, serviceKey } = assertEnv();
  const { prisma } = await import("../src/lib/prisma");

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (reset) {
    console.log("--reset: removing prior QA rows for sellerqa / buyerqa …");
    for (const spec of ACCOUNTS) {
      await deleteExistingAccount(prisma, admin, spec);
    }
  }

  for (const spec of ACCOUNTS) {
    const existing = await findAuthUserIdByEmail(admin, spec.email);
    if (existing) {
      console.log(`Skip ${spec.email} — already exists (use --reset to recreate).`);
      continue;
    }
    await createAccount(prisma, admin, spec);
  }

  const password = qaPassword();
  console.log("\n=== Beta QA accounts (Supabase project xkaaicokjgmpbctfermj) ===");
  console.log(`Password (all): ${password}`);
  console.log("(Override with BETA_QA_ACCOUNT_PASSWORD in web/.env for scripts only.)\n");
  console.log("Seller (Stripe + ship-from via app):");
  console.log(`  email:    ${BETA_QA_SELLER_EMAIL}`);
  console.log(`  username: ${BETA_QA_SELLER_USERNAME}`);
  console.log("\nBuyer (live room + bids):");
  console.log(`  email:    ${BETA_QA_BUYER_EMAIL}`);
  console.log(`  username: ${BETA_QA_BUYER_USERNAME}`);
  console.log("\nNext: follow web/docs/beta-qa-reset-checklist.md on beta.shopgetvaulted.com");
  console.log("Do NOT use legacy brysmith31 for this pass.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      /* env not loaded */
    }
  });
