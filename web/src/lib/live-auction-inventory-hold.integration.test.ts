import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  expireStaleLiveAuctionInventoryHolds,
  reserveListingInventoryHoldTx,
  consumeListingInventoryHoldTx,
  releaseActiveInventoryHoldsForListingAndBuyerTx,
} from "@/lib/live-auction-inventory-hold";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

describe("LiveAuctionInventoryHold (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it("blocks a second buyer from reserving the same listing", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ih1@test.internal", username: "ihseller1" });
    const a = await seedUser(prisma, { email: "ih2@test.internal", username: "ihbuyerA" });
    const b = await seedUser(prisma, { email: "ih3@test.internal", username: "ihbuyerB" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 25,
    });

    await prisma.$transaction((tx) =>
      reserveListingInventoryHoldTx(tx, {
        listingId: listing.id,
        userId: a.id,
        source: "test",
      }),
    );

    await expect(
      prisma.$transaction((tx) =>
        reserveListingInventoryHoldTx(tx, {
          listingId: listing.id,
          userId: b.id,
          source: "test",
        }),
      ),
    ).rejects.toThrow("LISTING_INVENTORY_HELD");
  });

  it("same buyer can refresh an active hold", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ih4@test.internal", username: "ihseller2" });
    const a = await seedUser(prisma, { email: "ih5@test.internal", username: "ihbuyerAa" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 10,
    });

    await prisma.$transaction((tx) =>
      reserveListingInventoryHoldTx(tx, { listingId: listing.id, userId: a.id, source: "t1", ttlMs: 60_000 }),
    );
    const first = await prisma.liveAuctionInventoryHold.findFirst({
      where: { listingId: listing.id, status: "active" },
    });
    await prisma.$transaction((tx) =>
      reserveListingInventoryHoldTx(tx, { listingId: listing.id, userId: a.id, source: "t2", ttlMs: 120_000 }),
    );
    const second = await prisma.liveAuctionInventoryHold.findFirst({
      where: { listingId: listing.id, status: "active" },
    });
    expect(first?.id).toBe(second?.id);
    expect(second?.source).toBe("t2");
  });

  it("expireStale marks past holds expired", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ih6@test.internal", username: "ihseller3" });
    const a = await seedUser(prisma, { email: "ih7@test.internal", username: "ihbuyerC" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 5,
    });
    const past = new Date(Date.now() - 3_600_000);
    await prisma.liveAuctionInventoryHold.create({
      data: {
        listingId: listing.id,
        userId: a.id,
        status: "active",
        source: "test",
        expiresAt: past,
      },
    });
    const n = await expireStaleLiveAuctionInventoryHolds(new Date());
    expect(n).toBeGreaterThanOrEqual(1);
    const row = await prisma.liveAuctionInventoryHold.findFirst({ where: { listingId: listing.id } });
    expect(row?.status).toBe("expired");
  });

  it("consume and release update status", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ih8@test.internal", username: "ihseller4" });
    const a = await seedUser(prisma, { email: "ih9@test.internal", username: "ihbuyerD" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 8,
    });
    const listing2 = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 2,
    });
    const ord = await prisma.order.create({
      data: {
        listingId: listing2.id,
        buyerId: a.id,
        sellerId: seller.id,
        itemPriceUsd: 2,
        shippingPriceUsd: 0,
        taxUsd: 0,
        totalUsd: 2,
        status: "pending",
        paymentStatus: "pending_payment",
        fulfillmentStatus: "pending",
        shipRecipientName: "x",
        shipAddress: "x",
        shipCity: "x",
        shipState: "x",
        shipZip: "x",
        shipCountry: "US",
      },
    });
    await prisma.$transaction((tx) =>
      reserveListingInventoryHoldTx(tx, { listingId: listing.id, userId: a.id, source: "c1" }),
    );
    await prisma.$transaction((tx) =>
      consumeListingInventoryHoldTx(tx, { listingId: listing.id, userId: a.id, orderId: ord.id }),
    );
    let row = await prisma.liveAuctionInventoryHold.findFirst({ where: { listingId: listing.id } });
    expect(row?.status).toBe("consumed");

    await prisma.liveAuctionInventoryHold.deleteMany({ where: { listingId: listing.id } });
    await prisma.$transaction((tx) =>
      reserveListingInventoryHoldTx(tx, { listingId: listing.id, userId: a.id, source: "r1" }),
    );
    await prisma.$transaction((tx) =>
      releaseActiveInventoryHoldsForListingAndBuyerTx(tx, { listingId: listing.id, userId: a.id }),
    );
    row = await prisma.liveAuctionInventoryHold.findFirst({ where: { listingId: listing.id } });
    expect(row?.status).toBe("released");
  });

  it("concurrent reserve: one winner, others see conflict", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ih10@test.internal", username: "ihseller5" });
    const buyers = await Promise.all([
      seedUser(prisma, { email: "c1@test.internal", username: "conc1" }),
      seedUser(prisma, { email: "c2@test.internal", username: "conc2" }),
      seedUser(prisma, { email: "c3@test.internal", username: "conc3" }),
    ]);
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 3,
    });

    const results = await Promise.allSettled(
      buyers.map((u) =>
        prisma.$transaction((tx) =>
          reserveListingInventoryHoldTx(tx, { listingId: listing.id, userId: u.id, source: "race" }),
        ),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
  });
});
