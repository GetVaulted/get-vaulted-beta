/**
 * Lookup seller / Stripe Connect rows by username or email fragment.
 * Usage: npx tsx scripts/diagnose-seller-user.ts brysmith31
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const q = process.argv[2]?.trim() || "brysmith31";

async function main() {
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

  if (users.length >= 2) {
    const emails = new Set(users.map((u) => u.email?.toLowerCase()));
    if (emails.size === 1) {
      console.log("\n⚠ Multiple User rows share the same email — mobile Bearer may resolve a different id than web NextAuth.");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
