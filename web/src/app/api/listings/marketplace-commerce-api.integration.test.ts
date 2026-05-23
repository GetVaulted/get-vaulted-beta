import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedListingImage,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const hoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: hoisted.getServerSession,
}));

describe("marketplace buy-now commerce API", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_integration_dummy");
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo_test_token");
    await bootstrapIntegrationPrisma();
    const listingsRoute = await import("@/app/api/listings/route");
    const bidsRoute = await import("@/app/api/bids/route");
    (globalThis as unknown as { __postListings: typeof listingsRoute.POST }).__postListings = listingsRoute.POST;
    (globalThis as unknown as { __getListings: typeof listingsRoute.GET }).__getListings = listingsRoute.GET;
    (globalThis as unknown as { __postBids: typeof bidsRoute.POST }).__postBids = bidsRoute.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  let postListings: (req: Request) => Promise<Response>;
  let getListings: (req: Request) => Promise<Response>;
  let postBids: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    postListings = (globalThis as unknown as { __postListings: typeof postListings }).__postListings;
    getListings = (globalThis as unknown as { __getListings: typeof getListings }).__getListings;
    postBids = (globalThis as unknown as { __postBids: typeof postBids }).__postBids;
    await resetIntegrationDatabase(prisma);
  });

  it("rejects POST marketplace timed auction publish", async () => {
    const seller = await seedUser(prisma, {
      email: "mkt-seller@test.internal",
      username: "mktseller",
      stripeAccountId: "acct_ready_mkt",
      stripeOnboardingComplete: true,
      shipFrom: {
        shipFromName: "Seller",
        shipFromStreet: "1 Main St",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await postListings(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Timed auction card",
          buyingFormat: "auction",
          status: "auction_live",
          startingBidUsd: 10,
          auctionDurationDays: 7,
          images: ["https://img.test/a.png"],
          parcelWeightOz: 16,
          parcelLengthIn: 10,
          parcelWidthIn: 8,
          parcelHeightIn: 4,
          shippingBaseWeightOz: 4,
          shippingIncrementalWeightOz: 1,
          shippingCategory: "raw_card",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { code?: string; error?: string };
    expect(j.code).toBe("MARKETPLACE_AUCTION_DISABLED");
    expect(j.error).toMatch(/no longer available/i);
  });

  it("allows POST buy_now with allowOffers and acceptTradeOffers flags", async () => {
    const seller = await seedUser(prisma, {
      email: "mkt-seller2@test.internal",
      username: "mktseller2",
      stripeAccountId: "acct_ready_mkt2",
      stripeOnboardingComplete: true,
      shipFrom: {
        shipFromName: "Seller Two",
        shipFromStreet: "1 Main St",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await postListings(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Buy now with offers",
          buyingFormat: "buy_now",
          status: "active",
          priceUsd: 99,
          allowOffers: true,
          acceptTradeOffers: true,
          images: ["https://img.test/b.png"],
          parcelWeightOz: 16,
          parcelLengthIn: 10,
          parcelWidthIn: 8,
          parcelHeightIn: 4,
          shippingBaseWeightOz: 4,
          shippingIncrementalWeightOz: 1,
          shippingCategory: "raw_card",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { listing?: { buyingFormat?: string; status?: string } };
    expect(j.listing?.buyingFormat).toBe("buy_now");
    expect(j.listing?.status).toBe("active");

    const row = await prisma.listing.findFirst({ where: { sellerId: seller.id, title: "Buy now with offers" } });
    expect(row?.allowOffers).toBe(true);
    expect(row?.acceptTradeOffers).toBe(true);
  });

  it("excludes legacy auction_live listings from published scope", async () => {
    const seller = await seedUser(prisma, {
      email: "mkt-seller3@test.internal",
      username: "mktseller3",
      stripeAccountId: "acct_ready_mkt3",
      stripeOnboardingComplete: true,
    });
    const active = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 50,
      allowOffers: true,
    });
    await seedListingImage(prisma, active.id);
    const legacyAuction = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 25,
      startingBidUsd: 25,
    });
    await seedListingImage(prisma, legacyAuction.id);

    const res = await getListings(new Request("http://localhost/api/listings?scope=published"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { listings?: { id: string }[] };
    const ids = (j.listings ?? []).map((l) => l.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(legacyAuction.id);
  });

  it("rejects POST /api/bids on legacy marketplace timed auction listing", async () => {
    const seller = await seedUser(prisma, {
      email: "mkt-seller4@test.internal",
      username: "mktseller4",
    });
    const buyer = await seedUser(prisma, {
      email: "mkt-buyer@test.internal",
      username: "mktbuyer",
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 40,
      startingBidUsd: 40,
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id, role: "user" } });

    const res = await postBids(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          maxBidUsd: 50,
          checkout: {
            shipRecipientName: "Buyer",
            shipAddress: "1 Main",
            shipCity: "Austin",
            shipState: "TX",
            shipZip: "78701",
            shipCountry: "US",
            paymentMethodId: "pm_card_visa",
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { code?: string; error?: string };
    expect(j.code).toBe("MARKETPLACE_AUCTION_DISABLED");
    expect(j.error).toMatch(/no longer available/i);
  });
});
