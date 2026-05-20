/**
 * Verify Supabase project ref alignment across mobile, web, and local Postgres URLs.
 *
 * Usage (from web/):
 *   npx tsx scripts/verify-beta-env-alignment.ts
 *   npx tsx scripts/verify-beta-env-alignment.ts brysmith31@gmail.com
 *
 * Does not print secrets. Compare Netlify UI values to the "expected ref" this script prints.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  redactDatabaseUrl,
  resolveDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "../src/lib/resolve-database-url";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });
config({ path: path.join(repoRoot, "mobile", ".env"), quiet: true });

type EnvRow = { label: string; ref: string | null; present: boolean };

function row(label: string, raw: string | undefined): EnvRow {
  const v = raw?.trim() ?? "";
  return { label, ref: v ? supabaseProjectRefFromUrl(v) : null, present: Boolean(v) };
}

async function lookupPrismaUser(q: string, dbUrl: string) {
  const prisma = createPostgresPrismaClient(dbUrl);
  try {
    const total = await prisma.user.count();
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
      },
      take: 5,
    });
    return { total, users };
  } finally {
    await prisma.$disconnect();
  }
}

async function lookupSupabaseAuth(emailFragment: string) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) {
    return { skipped: true as const, reason: "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in web/.env to query Auth users." };
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return { skipped: false as const, error: error.message };
  const needle = emailFragment.toLowerCase();
  const hits = (data.users ?? []).filter((u) => {
    const e = u.email?.toLowerCase() ?? "";
    const meta = u.user_metadata as Record<string, unknown> | undefined;
    const un = typeof meta?.username === "string" ? meta.username.toLowerCase() : "";
    return e.includes(needle) || un.includes(needle);
  });
  return { skipped: false as const, hits: hits.map((u) => ({ id: u.id, email: u.email ?? null })) };
}

async function main() {
  const q = process.argv[2]?.trim() || "brysmith31";

  const rows: EnvRow[] = [
    row("mobile EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
    row("web DATABASE_URL", process.env.DATABASE_URL),
    row("web INTEGRATION_DATABASE_URL", process.env.INTEGRATION_DATABASE_URL),
    row("web NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    row("web SUPABASE_URL", process.env.SUPABASE_URL),
  ];

  console.log("=== Beta environment alignment ===\n");
  for (const r of rows) {
    console.log(`${r.present ? "✓" : "—"} ${r.label}`);
    console.log(`    project ref: ${r.ref ?? "(not a Supabase URL / unparsable)"}`);
  }

  const refs = new Set(rows.filter((r) => r.ref).map((r) => r.ref as string));
  const aligned = refs.size <= 1;
  console.log(
    aligned
      ? `\n✓ All configured Supabase URLs share project ref: ${[...refs][0] ?? "(none set)"}`
      : `\n✗ MISMATCH — multiple project refs: ${[...refs].join(", ")}`,
  );

  if (!process.env.DATABASE_URL?.trim() && process.env.INTEGRATION_DATABASE_URL?.trim()) {
    console.log(
      "\n⚠ web/.env has INTEGRATION_DATABASE_URL but no DATABASE_URL. Scripts now fall back, but set DATABASE_URL to the same URI for Next.js dev and Netlify parity.",
    );
  }

  let dbUrl: string;
  try {
    dbUrl = resolveDatabaseUrl();
  } catch (e) {
    console.log(`\n✗ Cannot connect Prisma: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const dbRef = supabaseProjectRefFromUrl(dbUrl);
  console.log(`\nPrisma will use: ${redactDatabaseUrl(dbUrl)}`);
  console.log(`Prisma project ref: ${dbRef ?? "(unknown)"}`);

  if (dbRef && refs.size && ![...refs].every((r) => r === dbRef)) {
    console.log("✗ Postgres URL project ref does not match Supabase HTTPS URLs above.");
  }

  const { total, users } = await lookupPrismaUser(q, dbUrl);
  console.log(`\nPrisma User table: ${total} total rows`);
  console.log(`Search "${q}" in User.username / User.email: ${users.length} match(es)`);
  for (const u of users) {
    console.log(`  - ${u.id} | ${u.email} | @${u.username} | stripe=${u.stripeAccountId ? "yes" : "no"} | onboard=${u.stripeOnboardingComplete}`);
  }

  const auth = await lookupSupabaseAuth(q);
  if ("skipped" in auth && auth.skipped) {
    console.log(`\nSupabase Auth: ${auth.reason}`);
  } else if ("error" in auth && auth.error) {
    console.log(`\nSupabase Auth lookup failed: ${auth.error}`);
  } else if ("hits" in auth && auth.hits) {
    console.log(`\nSupabase Auth search "${q}": ${auth.hits.length} user(s)`);
    for (const u of auth.hits) {
      console.log(`  - ${u.id} | ${u.email}`);
    }
    if (auth.hits.length && !users.length) {
      console.log(
        "\n⚠ Auth user exists but no Prisma User row — mobile Bearer works; APIs create/link User on first Connect call. Env ref may still be correct.",
      );
    }
    if (!auth.hits.length && !users.length) {
      console.log(
        "\n⚠ No Auth or Prisma matches in THIS database. Beta mobile may use a different Supabase project than local web/.env — compare Netlify DATABASE_URL + mobile EXPO_PUBLIC_SUPABASE_URL in the built app.",
      );
    }
  }

  console.log("\n=== Netlify beta (manual) ===");
  console.log("Site: beta.shopgetvaulted.com — confirm env vars match ref above:");
  console.log("  DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  console.log("Mobile EAS/Expo build must use EXPO_PUBLIC_SUPABASE_URL with the SAME project ref.");
  console.log("EXPO_PUBLIC_SITE_URL=https://beta.shopgetvaulted.com (API host only; does not select Supabase project).");

  process.exit(aligned && (refs.size === 0 || dbRef === null || [...refs][0] === dbRef) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
