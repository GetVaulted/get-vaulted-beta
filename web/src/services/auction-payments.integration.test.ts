import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const stripeHoisted = vi.hoisted(() => ({
  api: {
    charges: { retrieve: vi.fn() },
    checkout: { sessions: { retrieve: vi.fn(), create: vi.fn() } },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => stripeHoisted.api as unknown as ReturnType<typeof actual.getStripe>,
  };
});
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { SELLER_COMMERCE_KIND } from "@/lib/seller-commerce-event";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedBid,
  seedListing,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";
import { offerAuctionToNextBidder } from "@/services/auction-recovery";
import { PAYMENT_EXPIRED, processAuctionPaymentExpiries, processStripeWebhookEvent } from "@/services/payments";
import type Stripe from "stripe";

describe("auction payment lifecycle (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it("closes due auction: pending order, awaiting_auction_payment, payment deadline set", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "as@test.internal", username: "aseller" });
    const buyer1 = await seedUser(prisma, { email: "ab1@test.internal", username: "abuyer1" });
    const buyer2 = await seedUser(prisma, { email: "ab2@test.internal", username: "abuyer2" });
    const buyer3 = await seedUser(prisma, { email: "ab3@test.internal", username: "abuyer3" });
    const ended = new Date(Date.now() - 60_000);
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 84,
      shippingPriceUsd: 5,
      auctionEndsAt: ended,
    });
    const t0 = new Date("2026-01-01T12:00:00.000Z");
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: buyer1.id,
      amountUsd: 50,
      maxBidUsd: 50,
      createdAt: t0,
    });
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: buyer3.id,
      amountUsd: 80,
      maxBidUsd: 80,
      createdAt: new Date(t0.getTime() + 1000),
    });
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: buyer2.id,
      amountUsd: 100,
      maxBidUsd: 100,
      createdAt: new Date(t0.getTime() + 2000),
    });

    await closeAuctionIfDuePrisma(listing.id);

    const order = await prisma.order.findUnique({ where: { listingId: listing.id } });
    expect(order).toBeTruthy();
    expect(order!.buyerId).toBe(buyer2.id);
    expect(order!.paymentStatus).toBe("pending_payment");
    expect(order!.paymentDeadlineAt).toBeTruthy();
    expect(order!.paymentDeadlineAt!.getTime()).toBeGreaterThan(Date.now());

    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("awaiting_auction_payment");
  });

  it("expired payment window moves listing to auction_ended_unpaid and expires order", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "ex1@test.internal", username: "exseller1" });
    const winner = await seedUser(prisma, { email: "exw@test.internal", username: "exwinner" });
    const loser = await seedUser(prisma, { email: "exl@test.internal", username: "exloser" });
    const ended = new Date(Date.now() - 120_000);
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 25,
      shippingPriceUsd: 5,
      auctionEndsAt: ended,
    });
    const t0 = new Date("2026-02-01T10:00:00.000Z");
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: loser.id,
      amountUsd: 20,
      maxBidUsd: 20,
      createdAt: t0,
    });
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: winner.id,
      amountUsd: 25,
      maxBidUsd: 25,
      createdAt: new Date(t0.getTime() + 1000),
    });
    await closeAuctionIfDuePrisma(listing.id);

    await prisma.order.updateMany({
      where: { listingId: listing.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 5_000) },
    });
    await processAuctionPaymentExpiries();

    const order = await prisma.order.findUnique({ where: { listingId: listing.id } });
    expect(order?.paymentStatus).toBe(PAYMENT_EXPIRED);
    expect(order?.status).toBe("cancelled");

    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("auction_ended_unpaid");

    const commerce = await prisma.sellerCommerceEvent.findFirst({
      where: { sellerId: seller.id, kind: SELLER_COMMERCE_KIND.auctionWinnerPaymentExpired },
    });
    expect(commerce).toBeTruthy();
  });

  it("finalize via Stripe webhook does not mark expired auction order paid or listing sold", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "fp@test.internal", username: "fpseller" });
    const buyer = await seedUser(prisma, { email: "fpb@test.internal", username: "fpbuyer" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_ended_unpaid",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 30,
      shippingPriceUsd: 5,
      auctionEndsAt: new Date(Date.now() - 3600_000),
    });
    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        itemPriceUsd: 30,
        shippingPriceUsd: 5,
        taxUsd: 0,
        totalUsd: 35,
        status: "cancelled",
        paymentStatus: PAYMENT_EXPIRED,
        fulfillmentStatus: "pending",
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
        paymentLabel: "card",
        paymentDeadlineAt: new Date(Date.now() - 10_000),
      },
    });

    const event = {
      type: "checkout.session.completed",
      id: "evt_finalize_skip",
      data: {
        object: {
          id: "cs_fp_test",
          metadata: {
            kind: "pay_order",
            orderId: order.id,
            listingId: listing.id,
            buyerId: buyer.id,
          },
          payment_intent: "pi_fp_test",
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const nextOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(nextOrder?.paymentStatus).toBe(PAYMENT_EXPIRED);
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("auction_ended_unpaid");
  });

  it("offer-next-bidder creates a new pending order for the next proxy leader", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "nx@test.internal", username: "nxseller" });
    const backup = await seedUser(prisma, { email: "nxb@test.internal", username: "nxbackup" });
    const winner = await seedUser(prisma, { email: "nxw@test.internal", username: "nxwinner" });
    const other = await seedUser(prisma, { email: "nxo@test.internal", username: "nxother" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_ended_unpaid",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 84,
      shippingPriceUsd: 5,
      auctionEndsAt: new Date(Date.now() - 3600_000),
    });
    const t0 = new Date("2026-03-01T08:00:00.000Z");
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: backup.id,
      amountUsd: 50,
      maxBidUsd: 50,
      createdAt: t0,
    });
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: other.id,
      amountUsd: 80,
      maxBidUsd: 80,
      createdAt: new Date(t0.getTime() + 1000),
    });
    await seedBid(prisma, {
      listingId: listing.id,
      bidderId: winner.id,
      amountUsd: 100,
      maxBidUsd: 100,
      createdAt: new Date(t0.getTime() + 2000),
    });

    await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: winner.id,
        sellerId: seller.id,
        itemPriceUsd: 84,
        shippingPriceUsd: 5,
        taxUsd: 0,
        totalUsd: 89,
        status: "cancelled",
        paymentStatus: PAYMENT_EXPIRED,
        fulfillmentStatus: "pending",
        shipRecipientName: "W",
        shipAddress: "2 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
        paymentLabel: "card",
        paymentDeadlineAt: new Date(Date.now() - 10_000),
      },
    });

    const { orderId } = await offerAuctionToNextBidder({
      listingId: listing.id,
      actorUserId: seller.id,
      actorIsAdmin: false,
    });

    const newOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(newOrder?.buyerId).toBe(other.id);
    expect(newOrder?.paymentStatus).toBe("pending_payment");
    expect(newOrder?.paymentDeadlineAt).toBeTruthy();

    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("awaiting_auction_payment");
  });
});
