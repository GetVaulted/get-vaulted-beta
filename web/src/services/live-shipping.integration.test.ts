import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { addOrderToLiveShippingSession, calculateLiveShippingCost } from "@/services/shipping/live-shipping-pricing";
import { createPayOrderCheckoutSession, PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const stripeHoisted = vi.hoisted(() => ({
  api: {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ status: "expired", url: null }),
        create: vi.fn().mockResolvedValue({ id: "cs_live_ship", url: "https://checkout.test/live" }),
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

describe("live shipping pricing sessions (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("LIVE_SHIPPING_CAP_CENTS", "1199");
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    stripeHoisted.api.checkout.sessions.retrieve.mockClear();
    stripeHoisted.api.checkout.sessions.create.mockClear();
  });

  async function seedAuctionWinOrder(args: {
    sellerId: string;
    buyerId: string;
    liveRoomId: string;
    shippingCategory: "raw_card" | "slab" | "small_collectible" | "custom";
    baseWeight: number;
    incrementalWeight: number;
    capCents?: number | null;
    shipAlone?: boolean;
  }) {
    const listing = await seedListing(prisma, {
      sellerId: args.sellerId,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      shippingPriceUsd: 0,
      shippingCategory: args.shippingCategory,
      shippingBaseWeightOz: args.baseWeight,
      shippingIncrementalWeightOz: args.incrementalWeight,
      shippingPriceCapCents: args.capCents ?? null,
      shipAlone: args.shipAlone ?? false,
    });
    await prisma.liveRoomItem.create({
      data: {
        liveRoomId: args.liveRoomId,
        listingId: listing.id,
        title: listing.title,
        status: "sold",
      },
    });
    return seedOrder(prisma, {
      listingId: listing.id,
      buyerId: args.buyerId,
      sellerId: args.sellerId,
      itemPriceUsd: 50,
      shippingPriceUsd: 0,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentLabel: "auction",
    });
  }

  it("first live win uses base, second uses incremental, and tier pricing grows", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "lsp1_s@test.internal", username: "lsp1seller" });
    const buyer = await seedUser(prisma, { email: "lsp1_b@test.internal", username: "lsp1buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Live 1", roomType: "auction", status: "live" },
    });

    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    const s1 = await addOrderToLiveShippingSession(o1.id);
    expect(s1.pricingWeightOz).toBe(4);
    expect(s1.shippingCostCents).toBe(399);

    const o2 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    const s2 = await addOrderToLiveShippingSession(o2.id);
    expect(s2.pricingWeightOz).toBe(5);
    expect(s2.shippingCostCents).toBe(499);
  });

  it("caps at 11.99 and marks capReached", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "lsp2_s@test.internal", username: "lsp2seller" });
    const buyer = await seedUser(prisma, { email: "lsp2_b@test.internal", username: "lsp2buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Live 2", roomType: "auction", status: "live" },
    });

    const orders = await Promise.all(
      Array.from({ length: 30 }).map(() =>
        seedAuctionWinOrder({
          sellerId: seller.id,
          buyerId: buyer.id,
          liveRoomId: live.id,
          shippingCategory: "slab",
          baseWeight: 8,
          incrementalWeight: 3,
          capCents: 1199,
        }),
      ),
    );
    let last = { pricingWeightOz: 0, shippingCostCents: 0, capReached: false };
    for (const o of orders) last = await addOrderToLiveShippingSession(o.id);
    expect(last.shippingCostCents).toBe(1199);
    expect(last.capReached).toBe(true);
    expect(calculateLiveShippingCost(last.pricingWeightOz, 1199)).toBe(1199);
  });

  it("separates sessions by seller and live show", async () => {
    const sellerA = await seedSellerStripeReady(prisma, { email: "lsp3_sa@test.internal", username: "lsp3sa" });
    const sellerB = await seedSellerStripeReady(prisma, { email: "lsp3_sb@test.internal", username: "lsp3sb" });
    const buyer = await seedUser(prisma, { email: "lsp3_b@test.internal", username: "lsp3b" });
    const liveA1 = await prisma.liveRoom.create({
      data: { sellerId: sellerA.id, title: "A1", roomType: "auction", status: "live" },
    });
    const liveA2 = await prisma.liveRoom.create({
      data: { sellerId: sellerA.id, title: "A2", roomType: "auction", status: "live" },
    });
    const liveB = await prisma.liveRoom.create({
      data: { sellerId: sellerB.id, title: "B", roomType: "auction", status: "live" },
    });

    const o1 = await seedAuctionWinOrder({ sellerId: sellerA.id, buyerId: buyer.id, liveRoomId: liveA1.id, shippingCategory: "raw_card", baseWeight: 4, incrementalWeight: 1 });
    const o2 = await seedAuctionWinOrder({ sellerId: sellerA.id, buyerId: buyer.id, liveRoomId: liveA2.id, shippingCategory: "raw_card", baseWeight: 4, incrementalWeight: 1 });
    const o3 = await seedAuctionWinOrder({ sellerId: sellerB.id, buyerId: buyer.id, liveRoomId: liveB.id, shippingCategory: "small_collectible", baseWeight: 6, incrementalWeight: 2 });
    await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await addOrderToLiveShippingSession(o3.id);

    const sessions = await prisma.liveShippingSession.findMany({ where: { buyerId: buyer.id } });
    expect(sessions).toHaveLength(3);
  });

  it("shipAlone does not join capped bundle session", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "lsp4_s@test.internal", username: "lsp4s" });
    const buyer = await seedUser(prisma, { email: "lsp4_b@test.internal", username: "lsp4b" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Live 4", roomType: "auction", status: "live" },
    });
    const normal = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
      shipAlone: false,
    });
    const alone = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "small_collectible",
      baseWeight: 6,
      incrementalWeight: 2,
      shipAlone: true,
    });
    await addOrderToLiveShippingSession(normal.id);
    await addOrderToLiveShippingSession(alone.id);
    const sessions = await prisma.liveShippingSession.findMany({
      where: { buyerId: buyer.id, sellerId: seller.id, liveShowId: live.id },
    });
    expect(sessions).toHaveLength(2);
  });

  it("checkout charges session shipping once for subsequent orders", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "lsp5_s@test.internal", username: "lsp5s" });
    const buyer = await seedUser(prisma, { email: "lsp5_b@test.internal", username: "lsp5b" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Live 5", roomType: "auction", status: "live" },
    });

    const paidOrder = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
      capCents: 1199,
    });
    const pendingOrder = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
      capCents: 1199,
    });
    const s1 = await addOrderToLiveShippingSession(paidOrder.id);
    await addOrderToLiveShippingSession(pendingOrder.id);

    await prisma.order.update({
      where: { id: paidOrder.id },
      data: { paymentStatus: PAYMENT_PAID, shippingPriceUsd: s1.shippingCostCents / 100 },
    });

    const { url } = await createPayOrderCheckoutSession({ buyerId: buyer.id, orderId: pendingOrder.id });
    expect(url).toContain("checkout.test");
    const refreshed = await prisma.order.findUnique({ where: { id: pendingOrder.id } });
    expect(refreshed?.shippingPriceUsd).toBe(1);
    expect(refreshed?.liveShippingSessionId).not.toBeNull();
  });
});
