/**
 * Remove screenshot / marketing demo listings, live rooms, and demo seller accounts.
 *
 * Usage (from web/):
 *   CONFIRM_PURGE_SCREENSHOT_DEMO=1 npx tsx scripts/purge-screenshot-demo.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  SCREENSHOT_DEMO_LIVE_ROOM_IDS,
  SCREENSHOT_DEMO_LISTING_IDS,
  screenshotDemoUserEmails,
} from "../src/lib/screenshot-demo-seed";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function purgeScreenshotDemo(prisma: PrismaClient) {
  const roomIds = [...SCREENSHOT_DEMO_LIVE_ROOM_IDS];
  const listingIds = [...SCREENSHOT_DEMO_LISTING_IDS];

  const messages = await prisma.liveRoomMessage.deleteMany({
    where: { liveRoomId: { in: roomIds } },
  });
  const items = await prisma.liveRoomItem.deleteMany({
    where: { liveRoomId: { in: roomIds } },
  });
  const rooms = await prisma.liveRoom.deleteMany({ where: { id: { in: roomIds } } });
  const images = await prisma.listingImage.deleteMany({ where: { listingId: { in: listingIds } } });
  const listings = await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });

  let usersDeleted = 0;
  for (const email of screenshotDemoUserEmails()) {
    try {
      const result = await prisma.user.deleteMany({ where: { email } });
      usersDeleted += result.count;
    } catch (e) {
      console.warn(`Could not delete user ${email}:`, e instanceof Error ? e.message : e);
    }
  }

  return { messages: messages.count, items: items.count, rooms: rooms.count, images: images.count, listings: listings.count, usersDeleted };
}

async function main() {
  if (process.env.CONFIRM_PURGE_SCREENSHOT_DEMO !== "1") {
    console.error("Refusing to run. Set CONFIRM_PURGE_SCREENSHOT_DEMO=1");
    process.exit(1);
  }

  resolveDatabaseUrl();
  const { prisma } = await import("../src/lib/prisma");
  const counts = await purgeScreenshotDemo(prisma);

  console.log("Screenshot demo purge complete.");
  console.log(`  Live room messages: ${counts.messages}`);
  console.log(`  Live room items: ${counts.items}`);
  console.log(`  Live rooms: ${counts.rooms}`);
  console.log(`  Listing images: ${counts.images}`);
  console.log(`  Listings: ${counts.listings}`);
  console.log(`  Demo users: ${counts.usersDeleted}`);
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
