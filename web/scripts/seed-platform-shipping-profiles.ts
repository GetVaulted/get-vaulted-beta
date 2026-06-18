/**
 * Upserts admin-controlled platform shipping profiles (Live, Marketplace, Trade).
 *
 * Usage: npm run db:seed-shipping-profiles
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedPlatformShippingProfiles } from "../src/services/shipping/platform-shipping-profiles";

async function main() {
  const result = await seedPlatformShippingProfiles();
  const profiles = await prisma.platformShippingProfile.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true, isActive: true },
  });
  console.log(`Seeded ${result.count} platform shipping profile(s).`);
  for (const p of profiles) {
    console.log(`  - ${p.slug} (${p.name})${p.isActive ? "" : " [inactive]"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
