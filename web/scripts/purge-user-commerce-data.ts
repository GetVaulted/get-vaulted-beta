/**
 * Remove commerce data (orders, listings, live shows, bids, etc.) for one user by email.
 * Keeps the User row, auth, Stripe Connect, ship-from, and Wallet addresses.
 *
 * Usage (from web/):
 *   CONFIRM_PURGE_USER_COMMERCE=1 npx tsx scripts/purge-user-commerce-data.ts brysmith31@icloud.com --dry-run
 *   CONFIRM_PURGE_USER_COMMERCE=1 npx tsx scripts/purge-user-commerce-data.ts brysmith31@icloud.com
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { redactDatabaseUrl, resolveDatabaseUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env"), quiet: true });
config({ path: path.join(__dirname, "..", ".env.local"), override: true, quiet: true });

const dryRun = process.argv.includes("--dry-run");
const emailArg = process.argv.find((a) => a.includes("@") && !a.startsWith("-"))?.trim().toLowerCase();

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

async function countCommerce(p: PrismaClient, userId: string) {
  const [orders, listings, liveRooms, offers, bids, notifications] = await Promise.all([
    p.order.count({ where: { OR: [{ buyerId: userId }, { sellerId: userId }] } }),
    p.listing.count({ where: { sellerId: userId } }),
    p.liveRoom.count({ where: { sellerId: userId } }),
    p.offer.count({ where: { OR: [{ buyerId: userId }, { sellerId: userId }] } }),
    p.bid.count({ where: { bidderId: userId } }),
    p.notification.count({ where: { userId } }),
  ]);
  return { orders, listings, liveRooms, offers, bids, notifications };
}

async function purgeCommerceForUser(p: PrismaClient, userId: string) {
  await p.layaway.deleteMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  await p.liveBidIdempotency.deleteMany({ where: { userId } });
  await p.liveAuctionInventoryHold.deleteMany({
    where: { OR: [{ userId }, { listing: { sellerId: userId } }] },
  });
  await p.liveAuctionProxyBid.deleteMany({ where: { userId } });
  await p.liveShippingSession.deleteMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  await p.order.deleteMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  await p.liveRoom.deleteMany({ where: { sellerId: userId } });
  await p.tradeOffer.deleteMany({
    where: { OR: [{ proposerId: userId }, { recipientId: userId }] },
  });
  await p.listing.deleteMany({ where: { sellerId: userId } });
  await p.bid.deleteMany({ where: { bidderId: userId } });
  await p.offer.deleteMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  await p.messageThread.deleteMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
  });
  await p.notification.deleteMany({ where: { userId } });
  await p.sellerCommerceEvent.deleteMany({ where: { sellerId: userId } });
  await p.watchlistItem.deleteMany({ where: { userId } });
  await p.sellerFollow.deleteMany({
    where: { OR: [{ followerId: userId }, { sellerId: userId }] },
  });
  await p.listingEndRequest.deleteMany({ where: { sellerId: userId } });
}

async function main() {
  if (process.env.CONFIRM_PURGE_USER_COMMERCE !== "1") {
    console.error("Refusing: set CONFIRM_PURGE_USER_COMMERCE=1");
    process.exit(1);
  }
  if (!emailArg) {
    console.error("Usage: CONFIRM_PURGE_USER_COMMERCE=1 npx tsx scripts/purge-user-commerce-data.ts <email> [--dry-run]");
    process.exit(1);
  }

  const dbUrl = resolveDatabaseUrl();
  log(`Database: ${redactDatabaseUrl(dbUrl)}`);
  log(`Target email: ${emailArg}${dryRun ? " (dry run)" : ""}`);

  const p = createPostgresPrismaClient(dbUrl);
  try {
    const users = await p.user.findMany({
      where: { email: { equals: emailArg, mode: "insensitive" } },
      select: { id: true, email: true, username: true },
    });

    if (users.length === 0) {
      console.error(`No user found for ${emailArg}`);
      process.exit(1);
    }

    for (const user of users) {
      const before = await countCommerce(p, user.id);
      log(
        `\n@${user.username} (${user.email}) id=${user.id}\n` +
          `  orders=${before.orders} listings=${before.listings} liveRooms=${before.liveRooms} ` +
          `offers=${before.offers} bids=${before.bids} notifications=${before.notifications}`,
      );

      if (dryRun) {
        log("  would purge all commerce rows above (user account kept)");
        continue;
      }

      await purgeCommerceForUser(p, user.id);
      const after = await countCommerce(p, user.id);
      log(
        `  purged → orders=${after.orders} listings=${after.listings} liveRooms=${after.liveRooms} ` +
          `(user row preserved)`,
      );
    }

    log("\nDone.");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
