/**
 * Seeds seller, buyer, auction live room, and queued live items for manual live-auction QA.
 *
 * Requires ALLOW_QA_LIVE_SEED=1 (refuses otherwise so accidental runs do not pollute the DB).
 *
 * Usage (repo root, DATABASE_URL in .env):
 *   ALLOW_QA_LIVE_SEED=1 npx tsx scripts/seed-live-auction-qa.ts
 *
 * Or: ALLOW_QA_LIVE_SEED=1 npm run qa:seed-live-auction
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

if (process.env.ALLOW_QA_LIVE_SEED !== "1") {
  // eslint-disable-next-line no-console
  console.error("Refusing to run: QA fixtures insert test users and listings. Set ALLOW_QA_LIVE_SEED=1 then re-run.");
  process.exit(1);
}

const PASSWORD = "qa-live-auction-123";
/** Default Trustap external id shape used elsewhere in tests; replace in staging if you require a real Trustap user. */
const QA_TRUSTAP_SELLER_ID = "1-00000000-0000-4000-8000-0000000000aa";

async function main() {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const seller = await prisma.user.create({
    data: {
      email: `qa_live_seller_${stamp}@test.internal`,
      username: `qaLiveSeller${stamp}`,
      emailVerified: new Date(),
      passwordHash,
      stripeAccountId: process.env.QA_SEED_STRIPE_ACCOUNT_ID ?? "acct_qa_seed_test",
      stripeOnboardingComplete: true,
      trustapUserId: QA_TRUSTAP_SELLER_ID,
      shipFromName: "QA Live Seller",
      shipFromStreet: "200 QA Auction Ln",
      shipFromCity: "Austin",
      shipFromState: "TX",
      shipFromZip: "78701",
      shipFromCountry: "US",
    },
  });

  const buyer = await prisma.user.create({
    data: {
      email: `qa_live_buyer_${stamp}@test.internal`,
      username: `qaLiveBuyer${stamp}`,
      emailVerified: new Date(),
      passwordHash,
    },
  });

  const liveRoom = await prisma.liveRoom.create({
    data: {
      sellerId: seller.id,
      title: `QA Live Auction ${stamp}`,
      roomType: "auction",
      status: "scheduled",
      category: "Trading Cards",
    },
  });

  async function seedAuctionListing(args: { title: string; shipAlone: boolean; base: number; inc: number }) {
    return prisma.listing.create({
      data: {
        sellerId: seller.id,
        title: args.title,
        description: "QA seed listing for live auction E2E.",
        category: "Trading Cards",
        condition: "NM",
        buyingFormat: "auction",
        status: "active",
        priceUsd: 10,
        startingBidUsd: 5,
        currentBidUsd: 5,
        shippingPriceUsd: 0,
        handlingTime: "1–2 business days",
        shippingCategory: "raw_card",
        shippingBaseWeightOz: args.base,
        shippingIncrementalWeightOz: args.inc,
        shippingPriceCapCents: 999,
        shipAlone: args.shipAlone,
        parcelWeightOz: 4,
        parcelLengthIn: 10,
        parcelWidthIn: 8,
        parcelHeightIn: 4,
      },
    });
  }

  const listings = await Promise.all([
    seedAuctionListing({ title: `QA Lot A ${stamp}`, shipAlone: false, base: 4, inc: 1 }),
    seedAuctionListing({ title: `QA Lot B ${stamp}`, shipAlone: false, base: 4, inc: 1 }),
    seedAuctionListing({ title: `QA Lot C ${stamp}`, shipAlone: false, base: 4, inc: 1 }),
    seedAuctionListing({ title: `QA Lot D ${stamp}`, shipAlone: false, base: 4, inc: 1 }),
    seedAuctionListing({ title: `QA Ship-alone ${stamp}`, shipAlone: true, base: 6, inc: 2 }),
  ]);

  let sort = 0;
  for (const listing of listings) {
    await prisma.liveRoomItem.create({
      data: {
        liveRoomId: liveRoom.id,
        listingId: listing.id,
        title: listing.title,
        status: "queued",
        sortOrder: sort++,
        startingBidUsd: 5,
        currentBidUsd: 5,
        priceUsd: null,
      },
    });
  }

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  console.log("\n=== QA live auction seed ===\n");
  console.log("Password (both users):", PASSWORD);
  console.log("\nSeller:");
  console.log("  email:", seller.email);
  console.log("  username:", seller.username);
  console.log("  id:", seller.id);
  console.log("\nBuyer:");
  console.log("  email:", buyer.email);
  console.log("  username:", buyer.username);
  console.log("  id:", buyer.id);
  console.log("\nLive room:");
  console.log("  id:", liveRoom.id);
  console.log("  Public:", `${origin}/live/${encodeURIComponent(liveRoom.id)}`);
  console.log("  Seller console:", `${origin}/seller/live/${encodeURIComponent(liveRoom.id)}/console`);
  console.log("\nListings (active, shipping profile + parcel):");
  for (const l of listings) {
    console.log(`  - ${l.id}  shipAlone=${l.shipAlone}  ${l.title}`);
  }
  console.log("\nNext: sign in as seller → go live from /seller/live. Sign in as buyer → open public live URL.");
  console.log("GET /api/seller/live-readiness (as seller) should report canGoLive when Shippo + Stripe env gates pass.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
