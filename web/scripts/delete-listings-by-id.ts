/**
 * Delete specific listing IDs after safety checks.
 *   CONFIRM_DELETE_LISTINGS=1 npx tsx scripts/delete-listings-by-id.ts <id> [id...]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const KEEP_ID = "cmpcu14qt000009ladfml7sms";
const DELETE_IDS = ["cmpcrx0r4000009kyi2e0ibyl", "cmpcrwy5u000009juzmxa61a1"];

async function main() {
  const ids = process.argv.slice(2);
  const toDelete = ids.length ? ids : DELETE_IDS;

  const keep = await prisma.listing.findUnique({
    where: { id: KEEP_ID },
    select: { id: true, sellerId: true, title: true },
  });
  if (!keep) {
    console.error(`Keep listing ${KEEP_ID} not found — aborting.`);
    process.exit(1);
  }

  const rows = await prisma.listing.findMany({
    where: { id: { in: toDelete } },
    select: {
      id: true,
      sellerId: true,
      title: true,
      status: true,
      _count: {
        select: {
          orders: true,
          offers: true,
          bids: true,
          incomingTradeOffers: true,
          tradeOfferItems: true,
          liveRoomItems: true,
          inventoryHolds: true,
          watchlist: true,
        },
      },
    },
  });

  if (rows.length !== toDelete.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = toDelete.filter((id) => !found.has(id));
    console.error("Missing listing ids:", missing);
    process.exit(1);
  }

  for (const row of rows) {
    if (row.sellerId !== keep.sellerId) {
      console.error(`Seller mismatch on ${row.id}: ${row.sellerId} !== ${keep.sellerId}`);
      process.exit(1);
    }
    const activity =
      row._count.orders +
      row._count.offers +
      row._count.bids +
      row._count.incomingTradeOffers +
      row._count.tradeOfferItems +
      row._count.liveRoomItems +
      row._count.inventoryHolds;
    console.log({
      id: row.id,
      title: row.title,
      status: row.status,
      sellerId: row.sellerId,
      orders: row._count.orders,
      offers: row._count.offers,
      bids: row._count.bids,
      tradeOffers: row._count.incomingTradeOffers + row._count.tradeOfferItems,
      liveRoomItems: row._count.liveRoomItems,
      inventoryHolds: row._count.inventoryHolds,
      watchlist: row._count.watchlist,
      totalActivity: activity,
    });
    if (row._count.orders > 0) {
      console.error(`Refusing: ${row.id} has orders`);
      process.exit(1);
    }
    if (activity > 0) {
      console.error(`Refusing: ${row.id} has active related records (total ${activity})`);
      process.exit(1);
    }
  }

  if (process.env.CONFIRM_DELETE_LISTINGS !== "1") {
    console.log("\nSafety checks passed. Set CONFIRM_DELETE_LISTINGS=1 to delete.");
    return;
  }

  for (const row of rows) {
    await prisma.listing.delete({ where: { id: row.id } });
    console.log(`deleted ${row.id} (${row.title})`);
  }
  console.log(`\nKept ${keep.id} (${keep.title})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
