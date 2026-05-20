/**
 * Lookup seller / Stripe Connect rows by username or email fragment.
 *
 * Usage (from web/):
 *   npx tsx scripts/diagnose-seller-user.ts brysmith31
 *   npx tsx scripts/diagnose-seller-user.ts brysmith31@gmail.com
 */
import { config } from "dotenv";
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

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const q = process.argv[2]?.trim() || "brysmith31";

async function main() {
  const dbUrl = resolveDatabaseUrl();
  const ref = supabaseProjectRefFromUrl(dbUrl);
  console.log(`Database: ${redactDatabaseUrl(dbUrl)}`);
  console.log(`Supabase project ref: ${ref ?? "(unknown)"}\n`);

  const prisma = createPostgresPrismaClient(dbUrl);
  try {
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
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeVerificationStatus: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    console.log(`Matches for "${q}": ${users.length}`);
    for (const u of users) {
      console.log(JSON.stringify(u, null, 2));
    }

    if (users.length === 0) {
      console.log(
        "\nNo Prisma User rows. Run: npx tsx scripts/verify-beta-env-alignment.ts",
        q.includes("@") ? q : `${q}@gmail.com`,
      );
    }

    if (users.length >= 2) {
      const emails = new Set(users.map((u) => u.email?.toLowerCase()));
      if (emails.size === 1) {
        console.log("\n⚠ Multiple User rows share the same email — mobile Bearer may resolve a different id than web NextAuth.");
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
