/**
 * Batch repair impossible marketplace commerce states:
 * paid orders with unsold listings, active layaways on sold listings, etc.
 *
 * Usage: npx tsx scripts/repair-marketplace-commerce-conflicts.ts [limit]
 */
import "dotenv/config";
import { repairListingCommerceConflicts } from "../src/services/layaway";

async function main() {
  const limit = Number(process.argv[2] ?? 200);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error("Limit must be a positive number.");
    process.exit(1);
  }
  const result = await repairListingCommerceConflicts(limit);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
