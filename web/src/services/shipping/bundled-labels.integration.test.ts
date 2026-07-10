import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID } from "@/services/payments";
import { addOrderToLiveShippingSession } from "@/services/shipping/live-shipping-pricing";
import { generateBundledShippoLabelForSession } from "@/services/shipping/bundled-labels";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const shippoHoisted = vi.hoisted(() => ({
  create: vi.fn(),
  rates: vi.fn(),
  purchase: vi.fn(),
}));

vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: () => true,
  shippoCreateShipment: (...args: unknown[]) => shippoHoisted.create(...args) as Promise<unknown>,
  shippoListRates: (...args: unknown[]) => shippoHoisted.rates(...args) as Promise<unknown>,
  shippoPurchaseRate: (...args: unknown[]) => shippoHoisted.purchase(...args) as Promise<unknown>,
}));

vi.mock("@/services/shipping/charge-seller-label-cost", () => ({
  chargeSellerForLabelCost: vi.fn().mockResolvedValue({
    ok: true,
    reversedCents: 501,
    reversalId: "trr_bundle_1",
    skipped: false,
  }),
  markOrderLabelCostReversalFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/payout/process-payout-tier-events", () => ({
  processLabelCreatedPayoutEvaluation: vi.fn().mockResolvedValue(undefined),
}));

describe("generateBundledShippoLabelForSession (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    shippoHoisted.create.mockReset();
    shippoHoisted.rates.mockReset();
    shippoHoisted.purchase.mockReset();
    vi.stubEnv("BUNDLE_WEIGHT_BUFFER_OZ", "0");
    shippoHoisted.create.mockResolvedValue({ object_id: "ship_bundle_1" });
    shippoHoisted.rates.mockResolvedValue({
      results: [
        {
          object_id: "rate_cheap",
          amount: "5.01",
          provider: "USPS",
          servicelevel: { name: "Priority" },
        },
      ],
    });
    shippoHoisted.purchase.mockResolvedValue({
      object_id: "tx_bundle_1",
      tracking_number: "1ZTRACKBUNDLE",
      tracking_url_provider: "https://track.example/bundle",
      label_url: "https://label.example/bundle.pdf",
      status: "SUCCESS",
    });
  });

  async function seedAuctionWinOrder(args: {
    sellerId: string;
    buyerId: string;
    liveRoomId: string;
    parcelWeightOz?: number | null;
    parcelLengthIn?: number | null;
    parcelWidthIn?: number | null;
    parcelHeightIn?: number | null;
    shipAlone?: boolean;
  }) {
    const listing = await seedListing(prisma, {
      sellerId: args.sellerId,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      shippingPriceUsd: 0,
      shippingCategory: "raw_card",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      parcelWeightOz: args.parcelWeightOz ?? null,
      parcelLengthIn: args.parcelLengthIn ?? null,
      parcelWidthIn: args.parcelWidthIn ?? null,
      parcelHeightIn: args.parcelHeightIn ?? null,
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
      paymentStatus: "pending",
      status: "pending",
      paymentLabel: "auction",
    });
  }

  it("creates one Shippo transaction and applies tracking to all eligible paid orders", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb_s@test.internal",
      username: "blbseller",
    });
    const buyer = await seedUser(prisma, { email: "blb_b@test.internal", username: "blbbuyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Bundle live", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      parcelWeightOz: 10,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const o2 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      parcelWeightOz: 12,
      parcelLengthIn: 12,
      parcelWidthIn: 6,
      parcelHeightIn: 5,
    });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.updateMany({
      where: { id: { in: [o1.id, o2.id] } },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippingChargedCents: 500 },
    });

    const result = await generateBundledShippoLabelForSession(sessionId, seller.id);
    expect(result.alreadyExisted).toBe(false);
    expect(result.shippoTransactionId).toBe("tx_bundle_1");
    expect(result.orderIds).toHaveLength(2);
    expect(shippoHoisted.create).toHaveBeenCalledTimes(1);
    const createBody = shippoHoisted.create.mock.calls[0]?.[0] as {
      parcels: Array<{ weight: string; length: string; width: string; height: string }>;
    };
    expect(createBody.parcels[0].weight).toBe("22");
    expect(createBody.parcels[0].length).toBe("12");
    expect(createBody.parcels[0].width).toBe("8");
    expect(createBody.parcels[0].height).toBe("5");

    const u1 = await prisma.order.findUnique({ where: { id: o1.id } });
    const u2 = await prisma.order.findUnique({ where: { id: o2.id } });
    expect(u1?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u2?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u1?.trackingNumber).toBe("1ZTRACKBUNDLE");
    expect(u2?.trackingNumber).toBe("1ZTRACKBUNDLE");
    expect(u1?.shippingLabelCostCents).toBe(251);
    expect(u2?.shippingLabelCostCents).toBe(250);
    expect((u1?.shippingLabelCostCents ?? 0) + (u2?.shippingLabelCostCents ?? 0)).toBe(501);
  });

  it("returns existing label without calling Shippo when any order is already labeled", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb2_s@test.internal",
      username: "blb2seller",
    });
    const buyer = await seedUser(prisma, { email: "blb2_b@test.internal", username: "blb2buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L2", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const o2 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.updateMany({
      where: { id: { in: [o1.id, o2.id] } },
      data: { paymentStatus: PAYMENT_PAID, status: "paid" },
    });
    await prisma.order.update({
      where: { id: o1.id },
      data: {
        shippoTransactionId: "tx_existing",
        labelUrl: "https://old.label",
        trackingNumber: "1ZOLD",
        shippingLabelCostCents: 400,
      },
    });

    const result = await generateBundledShippoLabelForSession(sessionId, seller.id);
    expect(result.alreadyExisted).toBe(true);
    expect(result.shippoTransactionId).toBe("tx_existing");
    expect(shippoHoisted.create).not.toHaveBeenCalled();
  });

  it("rejects ship-alone (per-order) sessions", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb3_s@test.internal",
      username: "blb3seller",
    });
    const buyer = await seedUser(prisma, { email: "blb3_b@test.internal", username: "blb3buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L3", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id, shipAlone: true });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await prisma.order.update({
      where: { id: o1.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid" },
    });

    await expect(generateBundledShippoLabelForSession(sessionId, seller.id)).rejects.toThrow("NOT_A_COMBINED_BUNDLE_SESSION");
  });

  it("excludes unpaid orders from the bundle label", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb4_s@test.internal",
      username: "blb4seller",
    });
    const buyer = await seedUser(prisma, { email: "blb4_b@test.internal", username: "blb4buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L4", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const o2 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.update({ where: { id: o1.id }, data: { paymentStatus: PAYMENT_PAID, status: "paid" } });

    await generateBundledShippoLabelForSession(sessionId, seller.id);

    const u1 = await prisma.order.findUnique({ where: { id: o1.id } });
    const u2 = await prisma.order.findUnique({ where: { id: o2.id } });
    expect(u1?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u2?.shippoTransactionId).toBeNull();
  });
});
