import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createBuyNowCheckoutSession } from "@/services/payments";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const stripeHoisted = vi.hoisted(() => ({
  api: {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ status: "expired", url: null }),
        create: vi.fn().mockResolvedValue({ id: "cs_live_bn", url: "https://checkout.test/bn" }),
      },
    },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => stripeHoisted.api as unknown as ReturnType<typeof actual.getStripe>,
  };
});

describe("live buy-now shipping (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("LIVE_SHIPPING_CAP_CENTS", "1199");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_live_bn");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    stripeHoisted.api.checkout.sessions.create.mockClear();
    delete process.env.TRUSTAP_USE_STUB_RESPONSE;
    delete process.env.TRUSTAP_API_KEY;
    delete process.env.TRUSTAP_API_BASE_URL;
    delete process.env.ESCROW_PROVIDER;
  });

  async function seedLiveSaleItem(args: {
    sellerId: string;
    listingId: string;
  }) {
    const room = await prisma.liveRoom.create({
      data: { sellerId: args.sellerId, title: "Sale show", roomType: "sale", status: "live" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: args.listingId,
        title: "On stream",
        status: "active",
      },
    });
    return { liveRoomId: room.id, liveRoomItemId: item.id };
  }

  it("attaches LiveShippingSession and charges live-tier shipping, not listing flat rate", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "lbn1_s@test.internal", username: "lbnseller1" });
    const buyer = await seedUser(prisma, { email: "lbn1_b@test.internal", username: "lbnbuyer1" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 20,
      shippingPriceUsd: 99,
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      shippingCategory: "raw_card",
    });
    const { liveRoomItemId } = await seedLiveSaleItem({ sellerId: seller.id, listingId: listing.id });

    await createBuyNowCheckoutSession({
      buyerId: buyer.id,
      listingId: listing.id,
      liveRoomItemId,
      shipping: {
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
      },
    });

    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order?.liveShippingSessionId).toBeTruthy();
    expect(order?.shippingPriceUsd).toBe(3.99);
    expect(stripeHoisted.api.checkout.sessions.create).toHaveBeenCalled();
    const call = stripeHoisted.api.checkout.sessions.create.mock.calls[0]?.[0] as {
      line_items?: Array<{ price_data?: { unit_amount?: number; product_data?: { name?: string } } }>;
    };
    const shipLine = call?.line_items?.[1];
    expect(shipLine?.price_data?.product_data?.name).toBe("Live bundled shipping");
    expect(shipLine?.price_data?.unit_amount).toBe(399);
  });

  it("escrow threshold uses max(listing shipping, live-tier estimate) so live path can qualify", async () => {
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    vi.stubEnv("TRUSTAP_API_KEY", "test_key");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.com");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");

    const seller = await seedSellerStripeReady(prisma, { email: "lbn2_s@test.internal", username: "lbnseller2" });
    const buyer = await seedUser(prisma, { email: "lbn2_b@test.internal", username: "lbnbuyer2" });

    const listingStripe = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 4997,
      shippingPriceUsd: 0,
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      shippingCategory: "raw_card",
    });
    await createBuyNowCheckoutSession({
      buyerId: buyer.id,
      listingId: listingStripe.id,
      shipping: {
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
      },
    });
    let order = await prisma.order.findFirst({ where: { listingId: listingStripe.id } });
    expect(order?.paymentMethod).toBe(OrderPaymentMethod.stripe);
    await prisma.order.deleteMany({ where: { listingId: listingStripe.id } });

    const listingEscrow = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 4997,
      shippingPriceUsd: 0,
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      shippingCategory: "raw_card",
    });
    const { liveRoomItemId } = await seedLiveSaleItem({ sellerId: seller.id, listingId: listingEscrow.id });

    await createBuyNowCheckoutSession({
      buyerId: buyer.id,
      listingId: listingEscrow.id,
      liveRoomItemId,
      shipping: {
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
      },
    });
    order = await prisma.order.findFirst({ where: { listingId: listingEscrow.id } });
    expect(order?.paymentMethod).toBe(OrderPaymentMethod.escrow);
    expect(order?.liveShippingSessionId).toBeTruthy();
  });
});
