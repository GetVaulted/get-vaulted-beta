import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID } from "@/services/payments";
import { addOrderToLiveShippingSession } from "@/services/shipping/live-shipping-pricing";
import { getSellerLiveShippingDashboard } from "@/services/account/seller-live-shipping-dashboard";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

describe("getSellerLiveShippingDashboard (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
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
  }) {
    const listing = await seedListing(prisma, {
      sellerId: args.sellerId,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      shippingPriceUsd: 0,
      shippingCategory: args.shippingCategory,
      shippingBaseWeightOz: args.baseWeight,
      shippingIncrementalWeightOz: args.incrementalWeight,
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
      paymentStatus: "pending",
      status: "pending",
      paymentLabel: "auction",
    });
  }

  it("returns only the seller sessions (not other sellers)", async () => {
    const sellerA = await seedSellerStripeReady(prisma, { email: "slsd_sa@test.internal", username: "slsdsa" });
    const sellerB = await seedSellerStripeReady(prisma, { email: "slsd_sb@test.internal", username: "slsdsb" });
    const buyer = await seedUser(prisma, { email: "slsd_b@test.internal", username: "slsdbuyer" });
    const liveA = await prisma.liveRoom.create({
      data: { sellerId: sellerA.id, title: "Show A", roomType: "auction", status: "live" },
    });
    const liveB = await prisma.liveRoom.create({
      data: { sellerId: sellerB.id, title: "Show B", roomType: "auction", status: "live" },
    });
    const oA = await seedAuctionWinOrder({
      sellerId: sellerA.id,
      buyerId: buyer.id,
      liveRoomId: liveA.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    const oB = await seedAuctionWinOrder({
      sellerId: sellerB.id,
      buyerId: buyer.id,
      liveRoomId: liveB.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    await addOrderToLiveShippingSession(oA.id);
    await addOrderToLiveShippingSession(oB.id);

    const dashA = await getSellerLiveShippingDashboard(sellerA.id);
    expect(dashA.sessions).toHaveLength(1);
    expect(dashA.sessions[0].liveShowTitle).toBe("Show A");
    expect(dashA.sessions[0].buyer.username).toBe("slsdbuyer");

    const dashB = await getSellerLiveShippingDashboard(sellerB.id);
    expect(dashB.sessions).toHaveLength(1);
    expect(dashB.sessions[0].liveShowTitle).toBe("Show B");
  });

  it("groups sessions by buyer and live show (distinct sessions)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "slsd_g@test.internal", username: "slsdgrp" });
    const buyer = await seedUser(prisma, { email: "slsd_gb@test.internal", username: "slsdgb" });
    const live1 = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Night 1", roomType: "auction", status: "live" },
    });
    const live2 = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Night 2", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live1.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    const o2 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live2.id,
      shippingCategory: "raw_card",
      baseWeight: 4,
      incrementalWeight: 1,
    });
    await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);

    const dash = await getSellerLiveShippingDashboard(seller.id);
    expect(dash.sessions).toHaveLength(2);
    const titles = new Set(dash.sessions.map((s) => s.liveShowTitle));
    expect(titles.has("Night 1")).toBe(true);
    expect(titles.has("Night 2")).toBe(true);
    expect(dash.sessions.every((s) => s.buyer.username === "slsdgb")).toBe(true);
  });

  it("sums shipping charged and label cost and margin per session and totals", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "slsd_eco@test.internal", username: "slsdeco" });
    const buyer = await seedUser(prisma, { email: "slsd_ecob@test.internal", username: "slsdecob" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Eco show", roomType: "auction", status: "live" },
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

    await prisma.order.update({
      where: { id: o1.id },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        shippingChargedCents: 500,
        shippingLabelCostCents: 100,
      },
    });
    await prisma.order.update({
      where: { id: o2.id },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        shippingChargedCents: 300,
        shippingLabelCostCents: 200,
      },
    });

    const dash = await getSellerLiveShippingDashboard(seller.id);
    expect(dash.sessions).toHaveLength(1);
    const s = dash.sessions[0];
    expect(s.shippingChargedCents).toBe(800);
    expect(s.shippingLabelCostCents).toBe(300);
    expect(s.marginCents).toBe(500);
    expect(s.marginNegative).toBe(false);

    expect(dash.totals.shippingChargedCents).toBe(800);
    expect(dash.totals.shippingLabelCostCents).toBe(300);
    expect(dash.totals.marginCents).toBe(500);
    expect(dash.totals.marginNegative).toBe(false);
  });

  it("flags negative margin on session and totals", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "slsd_neg@test.internal", username: "slsdneg" });
    const buyer = await seedUser(prisma, { email: "slsd_negb@test.internal", username: "slsdnegb" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Neg show", roomType: "auction", status: "live" },
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
    await prisma.order.update({
      where: { id: o1.id },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        shippingChargedCents: 100,
        shippingLabelCostCents: 400,
      },
    });

    const dash = await getSellerLiveShippingDashboard(seller.id);
    expect(dash.sessions[0].marginCents).toBe(-300);
    expect(dash.sessions[0].marginNegative).toBe(true);
    expect(dash.totals.marginNegative).toBe(true);
    expect(dash.totals.marginCents).toBe(-300);
  });

  it("ordersNeedingLabels is empty when every paid order has a label; partial when mixed", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "slsd_lbl@test.internal", username: "slsdlbl" });
    const buyer = await seedUser(prisma, { email: "slsd_lblb@test.internal", username: "slsdlblb" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Label show", roomType: "auction", status: "live" },
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

    await prisma.order.update({
      where: { id: o1.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippoTransactionId: "tr_1", shippingChargedCents: 200 },
    });
    await prisma.order.update({
      where: { id: o2.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippoTransactionId: null, labelUrl: null, shippingChargedCents: 200 },
    });

    const partial = await getSellerLiveShippingDashboard(seller.id);
    expect(partial.sessions[0].labelStatus).toBe("partial");
    expect(partial.sessions[0].ordersNeedingLabels).toEqual([o2.id]);
    expect(partial.sessions[0].orders.find((x) => x.id === o1.id)?.hasLabel).toBe(true);
    expect(partial.sessions[0].orders.find((x) => x.id === o2.id)?.hasLabel).toBe(false);

    await prisma.order.update({
      where: { id: o2.id },
      data: { shippoTransactionId: "tr_2" },
    });
    const complete = await getSellerLiveShippingDashboard(seller.id);
    expect(complete.sessions[0].labelStatus).toBe("complete");
    expect(complete.sessions[0].ordersNeedingLabels).toEqual([]);
  });
});
