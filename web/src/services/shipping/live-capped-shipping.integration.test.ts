import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS } from "@/lib/live-show-shipping-terms";
import {
  filterShippoRatesByCarrierPreference,
  pickShippoRateForPreference,
} from "@/lib/unified-shipping-engine";
import { createLiveBuyNowOrder } from "@/lib/live-buy-now-purchase";
import { addOrderToLiveShippingSession } from "@/services/shipping/live-shipping-pricing";
import { ensureBreakSpotFulfillmentOrder } from "@/services/shipping/live-commerce-fulfillment-order";
import { quoteShippoCentsForPackageGroups } from "@/services/shipping/live-shipping-quote";
import { PAYMENT_FAILED, PAYMENT_PENDING } from "@/services/payments";
import { seedSellerShippingProfiles } from "@/services/shipping/seller-shipping-profiles";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const shippoHoisted = vi.hoisted(() => ({
  createShipment: vi.fn(),
  listRates: vi.fn(),
}));

vi.mock("@/lib/shippo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shippo")>();
  return {
    ...actual,
    isShippoConfigured: () => true,
    shippoCreateShipment: (...args: unknown[]) => shippoHoisted.createShipment(...args),
    shippoListRates: (...args: unknown[]) => shippoHoisted.listRates(...args),
  };
});

describe("live capped shipping settlement (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    shippoHoisted.createShipment.mockReset();
    shippoHoisted.listRates.mockReset();
  });

  async function seedCappedLiveRoom(sellerId: string, overrides?: { shippingTermsVersion?: number }) {
    return prisma.liveRoom.create({
      data: {
        sellerId,
        title: "Capped show",
        roomType: "auction",
        status: "live",
        shippingMode: "capped",
        shippingCapEnabled: true,
        shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
        carrierPreference: "best_rate",
        bundleEligiblePurchases: true,
        shippingTermsVersion: overrides?.shippingTermsVersion ?? 1,
      },
    });
  }

  async function seedAuctionWin(args: {
    sellerId: string;
    buyerId: string;
    liveRoomId: string;
    baseWeight?: number;
    incrementalWeight?: number;
  }) {
    const listing = await seedListing(prisma, {
      sellerId: args.sellerId,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      shippingPriceUsd: 0,
      shippingCategory: "raw_card",
      shippingBaseWeightOz: args.baseWeight ?? 4,
      shippingIncrementalWeightOz: args.incrementalWeight ?? 1,
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
      itemPriceUsd: 25,
      shippingPriceUsd: 0,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentLabel: "auction",
    });
  }

  it("1. auction settlement persists shipping snapshot and ledger update", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cap1_s@test.internal", username: "cap1seller" });
    const buyer = await seedUser(prisma, { email: "cap1_b@test.internal", username: "cap1buyer" });
    const live = await seedCappedLiveRoom(seller.id);
    const order = await seedAuctionWin({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });

    await addOrderToLiveShippingSession(order.id, { liveShowId: live.id });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.shippingTermsSnapshotJson).toBeTruthy();
    const snap = updated.shippingTermsSnapshotJson as Record<string, unknown>;
    expect(snap.liveShowId).toBe(live.id);
    expect(snap.shippingCapCents).toBe(DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS);
    expect(snap.shippingChargedThisPurchaseCents).toBe(Math.round(updated.shippingPriceUsd * 100));
    expect(updated.shippingPriceUsd).toBeGreaterThan(0);

    const session = await prisma.liveShippingSession.findFirstOrThrow({
      where: { buyerId: buyer.id, liveShowId: live.id },
    });
    expect(session.shippingChargedCents).toBe(Math.round(updated.shippingPriceUsd * 100));
  });

  it("2. live buy-now persists shipping snapshot and ledger update", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cap2_s@test.internal", username: "cap2seller" });
    const buyer = await seedUser(prisma, { email: "cap2_b@test.internal", username: "cap2buyer" });
    await prisma.address.create({
      data: {
        userId: buyer.id,
        type: "shipping",
        isDefault: true,
        name: "Cap Buyer",
        fullName: "Cap Buyer",
        line1: "1 Ship Ln",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
    });
    const live = await seedCappedLiveRoom(seller.id);
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 10,
      shippingPriceUsd: 0,
      shippingCategory: "raw_card",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: live.id,
        listingId: listing.id,
        title: listing.title,
        status: "active",
        priceUsd: 10,
      },
    });

    const created = await createLiveBuyNowOrder({
      buyerId: buyer.id,
      liveRoomId: live.id,
      liveRoomItemId: item.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.orderId } });
    expect(order.shippingTermsSnapshotJson).toBeTruthy();
    expect(order.shippingPriceUsd).toBeGreaterThan(0);
  });

  it("3. break spot purchase persists snapshot and uses Break Spot profile", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cap3_s@test.internal", username: "cap3seller" });
    const buyer = await seedUser(prisma, { email: "cap3_b@test.internal", username: "cap3buyer" });
    await prisma.address.create({
      data: {
        userId: buyer.id,
        type: "shipping",
        isDefault: true,
        name: "Break Buyer",
        fullName: "Break Buyer",
        line1: "2 Ship Ln",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
    });
    await seedSellerShippingProfiles(seller.id);
    const live = await prisma.liveRoom.create({
      data: {
        sellerId: seller.id,
        title: "Break",
        roomType: "break",
        status: "live",
        shippingMode: "capped",
        shippingCapEnabled: true,
        shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
    });
    const spot = await prisma.breakSpot.create({
      data: {
        liveRoomId: live.id,
        userId: buyer.id,
        spotLabel: "Cowboys",
        priceUsd: 15,
        claimStatus: "confirmed",
      },
    });

    const { orderId } = await ensureBreakSpotFulfillmentOrder(spot.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const snap = order.shippingTermsSnapshotJson as Record<string, unknown>;
    expect(snap).toBeTruthy();
    const profile = snap.shippingProfileSnapshot as Record<string, unknown> | null;
    expect(profile?.slug).toBe("live_break_spot");
  });

  it("4. USPS-only quote never selects UPS", () => {
    const rates = [
      { object_id: "ups1", amount: "5.00", provider: "UPS" },
      { object_id: "usps1", amount: "6.50", provider: "USPS" },
    ];
    const filtered = filterShippoRatesByCarrierPreference(rates, "usps");
    expect(filtered.every((r) => String(r.provider).toUpperCase().includes("USPS"))).toBe(true);
    const picked = pickShippoRateForPreference(rates, "usps");
    expect(picked?.object_id).toBe("usps1");
  });

  it("5. UPS-only quote never selects USPS", () => {
    const rates = [
      { object_id: "usps1", amount: "4.00", provider: "USPS" },
      { object_id: "ups1", amount: "7.00", provider: "UPS" },
    ];
    const picked = pickShippoRateForPreference(rates, "ups");
    expect(picked?.object_id).toBe("ups1");
  });

  it("6. Best Rate selects the lowest valid allowed rate", () => {
    const rates = [
      { object_id: "ups1", amount: "8.00", provider: "UPS" },
      { object_id: "usps1", amount: "5.50", provider: "USPS" },
      { object_id: "fedex1", amount: "3.00", provider: "FedEx" },
    ];
    const picked = pickShippoRateForPreference(rates, "best_rate");
    expect(picked?.object_id).toBe("usps1");
  });

  it("7. two near-simultaneous purchases cannot charge over $9.99 total", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cap7_s@test.internal", username: "cap7seller" });
    const buyer = await seedUser(prisma, { email: "cap7_b@test.internal", username: "cap7buyer" });
    const live = await seedCappedLiveRoom(seller.id);
    const o1 = await seedAuctionWin({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      baseWeight: 8,
      incrementalWeight: 3,
    });
    const o2 = await seedAuctionWin({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      baseWeight: 8,
      incrementalWeight: 3,
    });

    await Promise.all([
      addOrderToLiveShippingSession(o1.id, { liveShowId: live.id }),
      addOrderToLiveShippingSession(o2.id, { liveShowId: live.id }),
    ]);

    const orders = await prisma.order.findMany({ where: { id: { in: [o1.id, o2.id] } } });
    const totalCharged = orders.reduce((sum, o) => sum + Math.round(o.shippingPriceUsd * 100), 0);
    expect(totalCharged).toBeLessThanOrEqual(DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS);

    const session = await prisma.liveShippingSession.findFirstOrThrow({
      where: { buyerId: buyer.id, liveShowId: live.id },
    });
    expect(session.shippingChargedCents).toBeLessThanOrEqual(DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS);
  });

  it("8. live setting change applies only to future purchases; prior snapshots unchanged", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cap8_s@test.internal", username: "cap8seller" });
    const buyer = await seedUser(prisma, { email: "cap8_b@test.internal", username: "cap8buyer" });
    const live = await seedCappedLiveRoom(seller.id, { shippingTermsVersion: 1 });
    const o1 = await seedAuctionWin({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    await addOrderToLiveShippingSession(o1.id, { liveShowId: live.id });
    const first = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    const firstSnap = first.shippingTermsSnapshotJson as Record<string, unknown>;

    await prisma.liveRoom.update({
      where: { id: live.id },
      data: {
        shippingCapCents: 599,
        shippingTermsVersion: 2,
        carrierPreference: "usps",
      },
    });

    const o2 = await seedAuctionWin({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    await addOrderToLiveShippingSession(o2.id, { liveShowId: live.id });
    const second = await prisma.order.findUniqueOrThrow({ where: { id: o2.id } });
    const secondSnap = second.shippingTermsSnapshotJson as Record<string, unknown>;

    expect(firstSnap.shippingTermsVersion).toBe(1);
    expect(firstSnap.shippingCapCents).toBe(DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS);
    expect(secondSnap.shippingTermsVersion).toBe(2);
    expect(secondSnap.shippingCapCents).toBe(599);
    expect(first.shippingTermsSnapshotJson).toEqual(firstSnap);
  });

  it("9. a declined payment's shipping does not count against the buyer's cap on the next purchase", async () => {
    // Regression test: a buyer's payment on their first item fails/is declined, then they buy a
    // second item in the same show. The failed order's shipping was never actually collected, so it
    // must not be treated as "already reserved" — the second (truly-first-successful) purchase
    // should be priced exactly as if the failed order never happened, not discounted/free because the
    // ledger thinks the cap is already partly (or fully) spent.
    const seller = await seedSellerStripeReady(prisma, { email: "cap9_s@test.internal", username: "cap9seller" });
    const buyer = await seedUser(prisma, { email: "cap9_b@test.internal", username: "cap9buyer" });
    const live = await seedCappedLiveRoom(seller.id);

    const failedOrder = await seedAuctionWin({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    await addOrderToLiveShippingSession(failedOrder.id, { liveShowId: live.id });
    const settledFailed = await prisma.order.findUniqueOrThrow({ where: { id: failedOrder.id } });
    expect(settledFailed.shippingPriceUsd).toBeGreaterThan(0);

    // Payment gets declined — mirrors the real failure path (order stays, marked failed/cancelled).
    await prisma.order.update({
      where: { id: failedOrder.id },
      data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
    });

    // Buyer purchases a second, identically-weighted item in the same show.
    const nextOrder = await seedAuctionWin({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    await addOrderToLiveShippingSession(nextOrder.id, { liveShowId: live.id });
    const settledNext = await prisma.order.findUniqueOrThrow({ where: { id: nextOrder.id } });

    // The failed order's charge must not have been "spent" against the cap: this purchase should be
    // priced identically to the failed one (both are, in effect, the buyer's first successful item),
    // not $0/free.
    expect(settledNext.shippingPriceUsd).toBeGreaterThan(0);
    expect(settledNext.shippingPriceUsd).toBe(settledFailed.shippingPriceUsd);

    // The session ledger should reflect only the successful order's charge — not both.
    const session = await prisma.liveShippingSession.findFirstOrThrow({
      where: { buyerId: buyer.id, liveShowId: live.id },
    });
    expect(session.shippingChargedCents).toBe(Math.round(settledNext.shippingPriceUsd * 100));
  });

  it("Shippo quote honors carrier preference and falls back when no eligible rates", async () => {
    shippoHoisted.createShipment.mockResolvedValue({ object_id: "ship_1" });
    shippoHoisted.listRates.mockResolvedValue({
      results: [
        { object_id: "ups_only", amount: "4.00", provider: "UPS" },
      ],
    });

    const groups = [
      {
        packageIndex: 0,
        weightOz: 4,
        lengthIn: 8,
        widthIn: 6,
        heightIn: 1,
        items: [],
      },
    ];
    const quoted = await quoteShippoCentsForPackageGroups({
      groups,
      carrierPreference: "usps",
      addressFrom: {
        name: "Seller",
        street1: "1 Main",
        city: "Austin",
        state: "TX",
        zip: "78701",
        country: "US",
      },
      addressTo: {
        name: "Buyer",
        street1: "2 Oak",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        country: "US",
      },
    });
    expect(quoted).toEqual({ error: "NO_ELIGIBLE_RATES" });
  });
});
