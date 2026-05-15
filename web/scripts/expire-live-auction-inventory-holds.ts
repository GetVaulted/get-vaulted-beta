/**
 * Marks `active` `LiveAuctionInventoryHold` rows past `expiresAt` as `expired`.
 * Run from cron (e.g. every 5–15 minutes) in production.
 */
import "dotenv/config";
import { expireStaleLiveAuctionInventoryHolds } from "../src/lib/live-auction-inventory-hold";
import { prisma } from "../src/lib/prisma";

async function main() {
  const n = await expireStaleLiveAuctionInventoryHolds();
  console.info(`[expire-live-auction-inventory-holds] expired ${n} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
