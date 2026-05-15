import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";
import { PAYMENT_PAID, PAYMENT_PENDING, PAYMENT_REQUIRES_ACTION } from "@/services/payments";

vi.mock("@/lib/stripe-customer", () => ({
  assertPaymentMethodOwnedByUser: vi.fn().mockResolvedValue(undefined),
}));

const hoisted = vi.hoisted(() => ({
  stripeApi: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => hoisted.stripeApi as unknown as ReturnType<typeof actual.getStripe>,
  };
});

import { chargeMarketplaceOrderWithSavedPaymentMethod } from "@/lib/stripe-charge-order-saved-pm";

describe("chargeMarketplaceOrderWithSavedPaymentMethod (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    hoisted.stripeApi.paymentIntents.create.mockReset();
    hoisted.stripeApi.paymentIntents.retrieve.mockReset();
    await resetIntegrationDatabase(prisma);
  });

  it("creates a succeeded PaymentIntent and marks order paid + listing sold", async () => {
    hoisted.stripeApi.paymentIntents.create.mockResolvedValue({
      id: "pi_saved_ok",
      status: "succeeded",
      client_secret: "secret_ok",
    });

    const seller = await seedSellerStripeReady(prisma, { email: "ch1@test.internal", username: "chseller1" });
    const buyer = await seedUser(prisma, { email: "chb1@test.internal", username: "chbuyer1" });
    await prisma.user.update({
      where: { id: buyer.id },
      data: { stripeCustomerId: "cus_test_buy_saved1" },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 5,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 5,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      paymentLabel: "pm_123456789012345678901234",
    });

    const r = await chargeMarketplaceOrderWithSavedPaymentMethod({ buyerId: buyer.id, orderId: order.id });
    expect(r.outcome).toBe("paid");
    expect(hoisted.stripeApi.paymentIntents.create).toHaveBeenCalledTimes(1);

    const paid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paid?.paymentStatus).toBe(PAYMENT_PAID);
    expect(paid?.stripePaymentIntentId).toBe("pi_saved_ok");
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("sold");
  });

  it("returns requires_action and persists status when Stripe needs SCA", async () => {
    hoisted.stripeApi.paymentIntents.create.mockResolvedValue({
      id: "pi_saved_sca",
      status: "requires_action",
      client_secret: "secret_sca",
    });

    const seller = await seedSellerStripeReady(prisma, { email: "ch2@test.internal", username: "chseller2" });
    const buyer = await seedUser(prisma, { email: "chb2@test.internal", username: "chbuyer2" });
    await prisma.user.update({
      where: { id: buyer.id },
      data: { stripeCustomerId: "cus_test_buy_saved2" },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 5,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 12,
      shippingPriceUsd: 3,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      paymentLabel: "pm_123456789012345678901234",
    });

    const r = await chargeMarketplaceOrderWithSavedPaymentMethod({ buyerId: buyer.id, orderId: order.id });
    expect(r).toEqual(expect.objectContaining({ outcome: "requires_action", clientSecret: "secret_sca" }));

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.paymentStatus).toBe(PAYMENT_REQUIRES_ACTION);
    expect(updated?.stripePaymentIntentId).toBe("pi_saved_sca");
  });
});
