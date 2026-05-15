import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { addOrderToLiveShippingSession } from "@/services/shipping/live-shipping-pricing";
import { getBuyerBundledLiveShippingSessionUx } from "@/services/shipping/buyer-live-shipping-ux";
import { PAYMENT_PENDING } from "@/services/payments";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

describe("getBuyerBundledLiveShippingSessionUx (integration)", () => {
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

  it("returns empty snapshot when buyer has no bundled session yet", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s1@test.internal", username: "bsus1" });
    const buyer = await seedUser(prisma, { email: "bsu_b1@test.internal", username: "bsub1" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L", roomType: "auction", status: "live" },
    });
    const ux = await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id);
    expect(ux).not.toBeNull();
    expect(ux!.shippingCostCents).toBe(0);
    expect(ux!.pricingWeightOz).toBe(0);
    expect(ux!.tierLabel).toBeNull();
    expect(ux!.nextIncrementalCostCents).toBeNull();
    expect(ux!.capReached).toBe(false);
  });

  it("one bundled item: shows base shipping, tier, and next incremental", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s2@test.internal", username: "bsus2" });
    const buyer = await seedUser(prisma, { email: "bsu_b2@test.internal", username: "bsub2" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L2", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    await addOrderToLiveShippingSession(o1.id);
    const ux = await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id);
    expect(ux!.shippingCostCents).toBe(399);
    expect(ux!.pricingWeightOz).toBe(4);
    expect(ux!.tierLabel).toBe("1–4 oz tier");
    expect(ux!.capReached).toBe(false);
    expect(ux!.nextIncrementalCostCents).toBe(100);
  });

  it("multiple items: reflects aggregated pricing weight and next delta", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s3@test.internal", username: "bsus3" });
    const buyer = await seedUser(prisma, { email: "bsu_b3@test.internal", username: "bsub3" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L3", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    const o2 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    const ux = await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id);
    expect(ux!.pricingWeightOz).toBe(5);
    expect(ux!.shippingCostCents).toBe(499);
    expect(ux!.tierLabel).toBe("5–8 oz tier");
    expect(ux!.capReached).toBe(false);
    // Same 5–8 oz tier: one more raw-card incremental oz stays flat until the tier boundary.
    expect(ux!.nextIncrementalCostCents).toBe(0);
  });

  it("cap reached: next incremental is 0", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s4@test.internal", username: "bsus4" });
    const buyer = await seedUser(prisma, { email: "bsu_b4@test.internal", username: "bsub4" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L4", roomType: "auction", status: "live" },
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
    for (const o of orders) await addOrderToLiveShippingSession(o.id);
    const ux = await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id);
    expect(ux!.capReached).toBe(true);
    expect(ux!.shippingCostCents).toBe(1199);
    expect(ux!.nextIncrementalCostCents).toBe(0);
  });

  it("shipAlone orders do not populate bundled UX snapshot", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s5@test.internal", username: "bsus5" });
    const buyer = await seedUser(prisma, { email: "bsu_b5@test.internal", username: "bsub5" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L5", roomType: "auction", status: "live" },
    });
    const alone = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
      shipAlone: true,
    });
    await addOrderToLiveShippingSession(alone.id);
    const ux = await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id);
    expect(ux!.shippingCostCents).toBe(0);
    expect(ux!.pricingWeightOz).toBe(0);
    expect(ux!.nextIncrementalCostCents).toBeNull();
  });

  it("returns null for non-auction/sale room", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "bsu_s6@test.internal", username: "bsus6" });
    const buyer = await seedUser(prisma, { email: "bsu_b6@test.internal", username: "bsub6" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "B", roomType: "break", status: "live" },
    });
    expect(await getBuyerBundledLiveShippingSessionUx(buyer.id, live.id)).toBeNull();
  });
});
