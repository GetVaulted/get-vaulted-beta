/**
 * Drain unpublished `LiveAuctionEvent` rows to Supabase broadcast (same path as `after()` fan-out).
 *
 * Usage:
 *   npx tsx scripts/auction-fanout-drain.ts
 *   npx tsx scripts/auction-fanout-drain.ts <liveRoomId>
 * Env: AUCTION_FANOUT_LIMIT (1–200, default 50)
 */
import "dotenv/config";
import { flushPendingLiveAuctionFanout } from "../src/lib/live-auction-fanout-flush";
import { prisma } from "../src/lib/prisma";

async function main() {
  const roomArg = process.argv[2]?.trim();
  const limitRaw = process.env.AUCTION_FANOUT_LIMIT;
  const limitParsed = limitRaw ? Number(limitRaw) : undefined;
  const limit = limitParsed != null && Number.isFinite(limitParsed) ? limitParsed : undefined;

  const n = await flushPendingLiveAuctionFanout({
    liveRoomId: roomArg || undefined,
    limit,
  });
  // eslint-disable-next-line no-console
  console.log(`Published ${n} auction event(s).`);
}

void main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
