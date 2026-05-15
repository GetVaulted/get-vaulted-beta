/**
 * Removes rows created by `prisma/seed.ts` and `scripts/seed-live-auction-qa.ts`
 * (fixture listing ids, demo live rooms, `*@getvaulted.internal` users, `qa_live_*@test.internal` users).
 * Safe for a dev DB that never mixed real orders with seed listings; may fail if seed listings have orders (FK).
 *
 * Usage: CONFIRM_PURGE_DEMO=1 npx tsx scripts/purge-demo-seed-data.ts
 */
import "dotenv/config";
import { seedMarketplaceListings } from "../prisma/seed-marketplace-fixtures";
import { prisma } from "../src/lib/prisma";
import { DEMO_SEED_SELLER_EMAIL_SUFFIX } from "../src/lib/demo-seed-sellers";

const SEED_LIVE_ROOM_IDS = [
  "seed_lr_break_live",
  "seed_lr_sale_live",
  "seed_lr_auction_live",
  "seed_lr_auction_sched",
  "seed_lr_sale_sched",
] as const;

async function main() {
  if (process.env.CONFIRM_PURGE_DEMO !== "1") {
    // eslint-disable-next-line no-console
    console.error(
      "Refusing: set CONFIRM_PURGE_DEMO=1 to delete Prisma seed demo rows (live rooms, fixture listings, getvaulted.internal users).",
    );
    process.exit(1);
  }

  const listingIds = seedMarketplaceListings.map((l) => l.id);

  const rooms = await prisma.liveRoom.deleteMany({
    where: { id: { in: [...SEED_LIVE_ROOM_IDS] } },
  });
  // eslint-disable-next-line no-console
  console.log(`Deleted ${rooms.count} seed live rooms.`);

  const listings = await prisma.listing.deleteMany({
    where: { id: { in: listingIds } },
  });
  // eslint-disable-next-line no-console
  console.log(`Deleted ${listings.count} seed marketplace listings (by id).`);

  const users = await prisma.user.deleteMany({
    where: { email: { endsWith: DEMO_SEED_SELLER_EMAIL_SUFFIX } },
  });
  // eslint-disable-next-line no-console
  console.log(`Deleted ${users.count} users with email *${DEMO_SEED_SELLER_EMAIL_SUFFIX}.`);

  const qaUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        { AND: [{ email: { startsWith: "qa_live_seller_" } }, { email: { endsWith: "@test.internal" } }] },
        { AND: [{ email: { startsWith: "qa_live_buyer_" } }, { email: { endsWith: "@test.internal" } }] },
      ],
    },
  });
  // eslint-disable-next-line no-console
  console.log(
    `Deleted ${qaUsers.count} QA live-auction seed users (qa_live_*@test.internal). Listings and rooms cascade.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
