/**
 * Deterministic local QA environment gate — run before any manual QA.
 *
 * Usage (from web/):
 *   npm run qa:local-env-check
 *   npm run qa:local-env-check -- --api-base http://192.168.1.10:3000
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BETA_QA_SELLER_EMAIL = "sellerqa@getvaultedtest.com";
const BETA_QA_BUYER_EMAIL = "buyerqa@getvaultedtest.com";
const BETA_QA_SELLER_USERNAME = "sellerqa";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { serializePrismaClientError } from "../src/lib/prisma-client-error-serialize";
import {
  redactDatabaseUrl,
  resolveDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "../src/lib/resolve-database-url";
import { pickPrismaUserIdForSupabaseSession } from "../src/lib/pick-prisma-user-for-supabase-auth";
import { sellerCanSellFromConnectSnapshot } from "../src/lib/stripe-connect-status-response";
import { onboardingUiStatusFromPartial } from "../src/lib/stripe-connect-account-map";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..");
const EXPECTED_REF = "xkaaicokjgmpbctfermj";

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });
config({ path: path.join(repoRoot, "mobile", ".env"), quiet: true });

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
let exitCode = 0;

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  if (!ok) exitCode = 1;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  console.log(`    ${detail}`);
}

function parseApiBaseArg(): string {
  const idx = process.argv.indexOf("--api-base");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!.replace(/\/+$/, "");
  const env =
    process.env.QA_LOCAL_API_BASE?.trim() ??
    process.env.NEXTAUTH_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "http://localhost:3000";
  return env.replace(/\/+$/, "");
}

async function main() {
  console.log("=== QA local environment check ===\n");

  const mobileSupa = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const webSupa =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const mobileSite = process.env.EXPO_PUBLIC_SITE_URL?.trim() ?? "";
  const mobileApi = process.env.EXPO_PUBLIC_WEB_API_URL?.trim() ?? "";

  const mobileRef = mobileSupa ? supabaseProjectRefFromUrl(mobileSupa) : null;
  const webRef = webSupa ? supabaseProjectRefFromUrl(webSupa) : null;

  record(
    "Mobile Supabase ref",
    mobileRef === EXPECTED_REF,
    mobileRef
      ? `EXPO_PUBLIC_SUPABASE_URL → ${mobileRef}${mobileRef === EXPECTED_REF ? "" : ` (expected ${EXPECTED_REF})`}`
      : "EXPO_PUBLIC_SUPABASE_URL not set in mobile/.env",
  );

  record(
    "Web Supabase ref",
    webRef === EXPECTED_REF,
    webRef
      ? `NEXT_PUBLIC_SUPABASE_URL → ${webRef}`
      : "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL not set in web/.env",
  );

  record(
    "Mobile API target",
    Boolean(mobileSite || mobileApi),
    mobileApi
      ? `EXPO_PUBLIC_WEB_API_URL=${mobileApi}`
      : mobileSite
        ? `EXPO_PUBLIC_SITE_URL=${mobileSite}`
        : "Set EXPO_PUBLIC_SITE_URL (or WEB_API_URL) so discovery uses Next API, not Supabase fallback",
  );

  if (mobileRef && webRef && mobileRef !== webRef) {
    record("Cross-client Supabase alignment", false, `mobile ${mobileRef} ≠ web ${webRef}`);
  } else if (mobileRef && webRef) {
    record("Cross-client Supabase alignment", true, `Both use ${mobileRef}`);
  }

  let dbUrl: string;
  try {
    dbUrl = resolveDatabaseUrl();
  } catch (e) {
    record("Database URL", false, e instanceof Error ? e.message : String(e));
    summarize();
    process.exit(1);
  }

  const dbRef = supabaseProjectRefFromUrl(dbUrl);
  record(
    "Database connectivity",
    true,
    `Prisma target ${redactDatabaseUrl(dbUrl)} (ref ${dbRef ?? "?"})`,
  );

  record(
    "DB ref matches Supabase",
    !dbRef || !webRef || dbRef === webRef,
    dbRef && webRef ? (dbRef === webRef ? "Aligned" : `DB ${dbRef} vs web ${webRef}`) : "Skipped",
  );

  const prisma = createPostgresPrismaClient(dbUrl);

  try {
    await prisma.$queryRaw`SELECT 1`;
    record("Postgres ping", true, "SELECT 1 ok");
  } catch (e) {
    record("Postgres ping", false, e instanceof Error ? e.message : String(e));
    await prisma.$disconnect();
    summarize();
    process.exit(1);
  }

  for (const email of [BETA_QA_SELLER_EMAIL, BETA_QA_BUYER_EMAIL]) {
    const rows = await prisma.user.findMany({
      where: { email },
      select: {
        id: true,
        username: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      },
    });
    record(
      `Prisma user ${email}`,
      rows.length >= 1,
      rows.length
        ? rows.map((u) => `${u.id} @${u.username} stripe=${u.stripeAccountId ? "yes" : "no"}`).join("; ")
        : "No row — run ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts",
    );
    if (rows.length > 1) {
      record(
        `Duplicate Prisma rows ${email}`,
        false,
        `${rows.length} users — causes payout/readiness drift across web/mobile`,
      );
    }
  }

  const sellerRows = await prisma.user.findMany({ where: { email: BETA_QA_SELLER_EMAIL } });
  const seller = sellerRows[0];
  if (seller) {
    const sellerLiveCount = await prisma.liveRoom.count({
      where: { sellerId: seller.id, status: { in: ["live", "scheduled"] } },
    });
    record(
      "Seller live+scheduled rooms (DB)",
      true,
      `${sellerLiveCount} room(s) for prisma id ${seller.id}`,
    );

    const ui = onboardingUiStatusFromPartial({
      hasAccountId: Boolean(seller.stripeAccountId?.trim()),
      stripeOnboardingComplete: Boolean(seller.stripeOnboardingComplete),
      stripeChargesEnabled: seller.stripeChargesEnabled ?? null,
      stripePayoutsEnabled: seller.stripePayoutsEnabled ?? null,
      requirementsDue: null,
    });
    const canSell = sellerCanSellFromConnectSnapshot({
      stripeAccountId: seller.stripeAccountId,
      stripeOnboardingComplete: Boolean(seller.stripeOnboardingComplete),
      stripeChargesEnabled: seller.stripeChargesEnabled ?? null,
      stripePayoutsEnabled: seller.stripePayoutsEnabled ?? null,
      onboardingUiStatus: ui,
    });
    record(
      "Seller payout snapshot (DB)",
      canSell || Boolean(seller.stripeAccountId),
      canSell
        ? "can_publish / payouts ready from persisted snapshot"
        : seller.stripeAccountId
          ? "stripeAccountId present but onboarding incomplete — HQ may ask for setup until refresh"
          : "No stripeAccountId — seller must complete Connect once per environment",
    );

    try {
      const { loadAccountSellerPayload } = await import("../src/lib/load-account-seller-payload");
      const payload = await loadAccountSellerPayload(seller.id);
      const partial = payload.partialErrors?.length ?? 0;
      record(
        "Seller Home payload (DB simulate)",
        partial === 0,
        partial
          ? `${partial} partial error(s): ${payload.partialErrors!.slice(0, 2).join("; ")}`
          : `OK — active listings ${payload.sellerHomeStats.activeListingsCount}, commerce events ${payload.commerceEvents.length}`,
      );
    } catch (e) {
      const pe = serializePrismaClientError(e);
      record(
        "Seller Home payload (DB simulate)",
        false,
        `${pe.code ?? pe.name}: ${pe.message} — run npm run qa:diagnose-account-seller`,
      );
    }
  }

  const supaUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (supaUrl && serviceKey) {
    const admin = createClient(supaUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const email of [BETA_QA_SELLER_EMAIL, BETA_QA_BUYER_EMAIL]) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      if (error) {
        record(`Supabase Auth ${email}`, false, error.message);
        continue;
      }
      const hit = (data.users ?? []).find((u) => u.email?.toLowerCase() === email);
      record(
        `Supabase Auth ${email}`,
        Boolean(hit),
        hit ? `auth id ${hit.id}` : "Missing — seed beta QA accounts",
      );
      if (hit && email === BETA_QA_SELLER_EMAIL && sellerRows.length) {
        const byId = sellerRows.find((u) => u.id === hit.id) ?? null;
        const byEmail = sellerRows.find((u) => u.email === email) ?? null;
        const picked = pickPrismaUserIdForSupabaseSession({
          supabaseUserId: hit.id,
          byId: byId
            ? {
                id: byId.id,
                stripeAccountId: byId.stripeAccountId,
                stripeOnboardingComplete: byId.stripeOnboardingComplete,
                stripeChargesEnabled: byId.stripeChargesEnabled,
                stripePayoutsEnabled: byId.stripePayoutsEnabled,
              }
            : null,
          byEmail: byEmail
            ? {
                id: byEmail.id,
                stripeAccountId: byEmail.stripeAccountId,
                stripeOnboardingComplete: byEmail.stripeOnboardingComplete,
                stripeChargesEnabled: byEmail.stripeChargesEnabled,
                stripePayoutsEnabled: byEmail.stripePayoutsEnabled,
              }
            : null,
        });
        const mismatch = sellerRows.length > 1 && picked && picked !== hit.id;
        record(
          "Canonical seller Prisma pick",
          !mismatch,
          picked
            ? `mobile/web APIs should use ${picked}${mismatch ? " (≠ supabase id — expected when email row has Stripe)" : ""}`
            : "Could not pick",
        );
      }
    }
  } else {
    record("Supabase Auth lookup", false, "Set SUPABASE_SERVICE_ROLE_KEY for auth user verification");
  }

  const apiBase = parseApiBaseArg();
  try {
    const res = await fetch(`${apiBase}/api/live-rooms?limit=40`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      record(
        "Live rooms API",
        false,
        `${apiBase}/api/live-rooms → HTTP ${res.status} (is \`npm run dev\` running?)`,
      );
    } else {
      const body = (await res.json()) as { rooms?: { sellerUsername?: string; status?: string }[] };
      const rooms = body.rooms ?? [];
      const sellerRooms = rooms.filter(
        (r) => (r.sellerUsername ?? "").toLowerCase() === BETA_QA_SELLER_USERNAME,
      );
      record(
        "Live rooms API",
        true,
        `${rooms.length} public room(s); ${sellerRooms.length} for @${BETA_QA_SELLER_USERNAME}`,
      );
      record(
        "API auth config",
        true,
        `Optional: curl ${apiBase}/api/auth/config`,
      );
    }
  } catch (e) {
    record(
      "Live rooms API",
      false,
      `Could not reach ${apiBase} — ${e instanceof Error ? e.message : String(e)}. Start web dev server or pass --api-base`,
    );
  }

  await prisma.$disconnect();
  summarize();
  process.exit(exitCode);
}

function summarize() {
  console.log("\n=== Summary ===");
  const failed = checks.filter((c) => !c.ok);
  if (!failed.length) {
    console.log("All checks passed. Safe to start manual QA after Clear QA Session on each device.");
  } else {
    console.log(`${failed.length} check(s) failed:`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    console.log("\nDo not start manual QA until this script passes.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
