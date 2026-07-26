/**
 * Upserts admin-controlled platform shipping profiles (Live, Marketplace, Trade).
 *
 * Usage: npm run db:seed-shipping-profiles
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { seedPlatformShippingProfiles } = await import(
    "../src/services/shipping/platform-shipping-profiles"
  );

  try {
    const result = await seedPlatformShippingProfiles();
    const profiles = await prisma.platformShippingProfile.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, isActive: true },
    });
    console.log(`Seeded ${result.count} platform shipping profile(s).`);
    for (const p of profiles) {
      console.log(`  - ${p.slug} (${p.name})${p.isActive ? "" : " [inactive]"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
