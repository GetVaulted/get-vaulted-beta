import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedListingImage,
  seedLiveRoom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const hoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: hoisted.getServerSession,
}));

describe("listing publish + live room Stripe guards (API)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_integration_dummy");
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo_test_token");
    await bootstrapIntegrationPrisma();
    const listingsRoute = await import("@/app/api/listings/route");
    const listingRoute = await import("@/app/api/listings/[id]/route");
    const roomRoute = await import("@/app/api/live-rooms/[id]/route");
    (globalThis as unknown as { __postListings: typeof listingsRoute.POST }).__postListings = listingsRoute.POST;
    (globalThis as unknown as { __patchListing: typeof listingRoute.PATCH }).__patchListing = listingRoute.PATCH;
    (globalThis as unknown as { __patchRoom: typeof roomRoute.PATCH }).__patchRoom = roomRoute.PATCH;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  let postListings: (req: Request) => Promise<Response>;
  let patchListing: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let patchRoom: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    postListings = (globalThis as unknown as { __postListings: typeof postListings }).__postListings;
    patchListing = (globalThis as unknown as { __patchListing: typeof patchListing }).__patchListing;
    patchRoom = (globalThis as unknown as { __patchRoom: typeof patchRoom }).__patchRoom;
    await resetIntegrationDatabase(prisma);
  });

  it("rejects publish without parcel data", async () => {
    const seller = await seedUser(prisma, {
      email: "s1@test.internal",
      username: "seller1",
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 25,
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchListing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { code?: string };
    expect(j.code).toBe("PARCEL_REQUIRED");
  });

  it("rejects publish when Stripe Connect is not ready", async () => {
    const seller = await seedUser(prisma, {
      email: "s2@test.internal",
      username: "seller2",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      shipFrom: {
        shipFromName: "Seller Two",
        shipFromStreet: "1 Main St",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 25,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchListing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: string; issues?: string[] };
    expect(j.error).toBe("SELLER_REQUIREMENTS_INCOMPLETE");
    expect(Array.isArray(j.issues)).toBe(true);
    expect((j.issues ?? []).some((m) => /stripe/i.test(m))).toBe(true);
  });

  it("rejects publish when ship-from address is missing", async () => {
    const seller = await seedUser(prisma, {
      email: "s3@test.internal",
      username: "seller3",
      stripeAccountId: "acct_ready_shipfrom_missing",
      stripeOnboardingComplete: true,
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 25,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchListing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: string; issues?: string[] };
    expect(j.error).toBe("SELLER_REQUIREMENTS_INCOMPLETE");
    expect((j.issues ?? []).some((m) => /ship-from address/i.test(m))).toBe(true);
  });

  it("rejects publish when listing shipping profile is invalid", async () => {
    const seller = await seedUser(prisma, {
      email: "s4@test.internal",
      username: "seller4",
      stripeAccountId: "acct_ready",
      stripeOnboardingComplete: true,
      shipFrom: {
        shipFromName: "Seller Four",
        shipFromStreet: "1 Main St",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 25,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
      shippingBaseWeightOz: 0,
    });
    await prisma.listing.update({
      where: { id: listing.id },
      data: { shippingBaseWeightOz: 0, shippingIncrementalWeightOz: -1 },
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchListing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: string; issues?: string[] };
    expect(j.error).toBe("SELLER_REQUIREMENTS_INCOMPLETE");
    expect((j.issues ?? []).some((m) => /shipping profile/i.test(m))).toBe(true);
  });

  it("allows publish when seller requirements and parcel data are ready", async () => {
    const seller = await seedUser(prisma, {
      email: "s5@test.internal",
      username: "seller5",
      stripeAccountId: "acct_ready2",
      stripeOnboardingComplete: true,
      shipFrom: {
        shipFromName: "Seller Five",
        shipFromStreet: "1 Main St",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      priceUsd: 25,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    await seedListingImage(prisma, listing.id);
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchListing(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      listing?: {
        status?: string;
        shippingCategory?: string;
        shippingBaseWeightOz?: number;
        shippingIncrementalWeightOz?: number;
        parcelWeightOz?: number | null;
        parcelLengthIn?: number | null;
        parcelWidthIn?: number | null;
        parcelHeightIn?: number | null;
      };
    };
    expect(j.listing?.status).toBe("active");
    expect(j.listing?.shippingCategory).toBe("raw_card");
    expect(j.listing?.shippingBaseWeightOz).toBe(4);
    expect(j.listing?.shippingIncrementalWeightOz).toBe(1);
    expect(j.listing?.parcelWeightOz).toBe(16);
    expect(j.listing?.parcelLengthIn).toBe(10);
    expect(j.listing?.parcelWidthIn).toBe(8);
    expect(j.listing?.parcelHeightIn).toBe(4);
  });

  it("rejects creating an active listing before seller requirements are complete", async () => {
    const seller = await seedUser(prisma, {
      email: "s6@test.internal",
      username: "seller6",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });
    const res = await postListings(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Live now card",
          buyingFormat: "buy_now",
          status: "active",
          priceUsd: 50,
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
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: string; issues?: string[] };
    expect(j.error).toBe("SELLER_REQUIREMENTS_INCOMPLETE");
    expect(Array.isArray(j.issues)).toBe(true);
    expect((j.issues ?? []).length).toBeGreaterThan(0);
  });

  it("allows creating an active listing when seller requirements are ready", async () => {
    const seller = await seedUser(prisma, {
      email: "s7@test.internal",
      username: "seller7",
      stripeAccountId: "acct_ready3",
      stripeOnboardingComplete: true,
      shipFrom: {
        shipFromName: "Seller Seven",
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
          title: "Ready listing",
          buyingFormat: "buy_now",
          status: "active",
          priceUsd: 55,
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
    const j = (await res.json()) as { listing?: { status?: string } };
    expect(j.listing?.status).toBe("active");
  });

  it("returns 400 with readiness issues when admin starts room for seller without Connect", async () => {
    const admin = await seedUser(prisma, {
      email: "admin@test.internal",
      username: "adminuser",
      role: "admin",
    });
    const seller = await seedUser(prisma, {
      email: "sellerlr@test.internal",
      username: "sellerlr",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
    });
    const roomId = "itest_room_stripe_block";
    await seedLiveRoom(prisma, { id: roomId, sellerId: seller.id, status: "scheduled" });
    hoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await patchRoom(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      { params: Promise.resolve({ id: roomId }) },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { issues?: unknown; checks?: { hasStripeAccount?: boolean } };
    expect(Array.isArray(j.issues)).toBe(true);
    expect((j.issues as string[]).some((m) => /Stripe/i.test(m))).toBe(true);
    expect(j.checks?.hasStripeAccount).toBe(false);
  });
});
