import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { OrderPaymentMethod } from "@/generated/prisma/enums";
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
import {
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REQUIRES_ACTION,
  createBuyNowCheckoutSession,
  createPayOrderCheckoutSession,
  processStripeWebhookEvent,
} from "@/services/payments";

const hoisted = vi.hoisted(() => ({
  constructStripeWebhookEvent: vi.fn(),
  stripeApi: {
    charges: { retrieve: vi.fn().mockResolvedValue({ payment_intent: "pi_x" }) },
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ status: "expired", url: null }),
        create: vi.fn().mockResolvedValue({ id: "cs_test_new", url: "https://checkout.test/session" }),
      },
    },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => hoisted.stripeApi as unknown as ReturnType<typeof actual.getStripe>,
    constructStripeWebhookEvent: hoisted.constructStripeWebhookEvent,
  };
});

function checkoutCompletedSession(args: {
  eventId: string;
  sessionId: string;
  kind: "buy_now" | "pay_order";
  orderId: string;
  listingId: string;
  buyerId: string;
  paymentIntent?: string | null;
}): Stripe.Event {
  return {
    type: "checkout.session.completed",
    id: args.eventId,
    data: {
      object: {
        id: args.sessionId,
        metadata: {
          kind: args.kind,
          orderId: args.orderId,
          listingId: args.listingId,
          buyerId: args.buyerId,
          liveRoomItemId: "",
        },
        payment_intent: args.paymentIntent ?? "pi_ok",
      },
    },
  } as unknown as Stripe.Event;
}

describe("Stripe checkout + webhook handling (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_integration_dummy");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    await bootstrapIntegrationPrisma();
    const mod = await import("@/app/api/stripe/webhook/route");
    (globalThis as unknown as { __stripeWebhookPost: typeof mod.POST }).__stripeWebhookPost = mod.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  let stripeWebhookPOST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    stripeWebhookPOST = (globalThis as unknown as { __stripeWebhookPost: typeof stripeWebhookPOST }).__stripeWebhookPost;
    hoisted.constructStripeWebhookEvent.mockReset();
    hoisted.stripeApi.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_new",
      url: "https://checkout.test/session",
    });
    hoisted.stripeApi.checkout.sessions.retrieve.mockResolvedValue({ status: "expired", url: null });
    await resetIntegrationDatabase(prisma);
  });

  it("checkout.session.completed marks buy-now order paid and listing sold", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw1@test.internal", username: "swseller1" });
    const buyer = await seedUser(prisma, { email: "swb1@test.internal", username: "swbuyer1" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 20,
      shippingPriceUsd: 5,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 20,
      shippingPriceUsd: 5,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
    });

    const event = checkoutCompletedSession({
      eventId: "evt_completed_bn",
      sessionId: "cs_completed_bn",
      kind: "buy_now",
      orderId: order.id,
      listingId: listing.id,
      buyerId: buyer.id,
    });

    await processStripeWebhookEvent(event);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.paymentStatus).toBe(PAYMENT_PAID);
    expect(updated?.status).toBe("paid");
    expect(updated?.shippingChargedCents).toBe(500);
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("sold");
  });

  it("checkout.session.completed ignores marketplace orders that use escrow (Trustap)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw_esc@test.internal", username: "swseller_esc" });
    const buyer = await seedUser(prisma, { email: "swb_esc@test.internal", username: "swbuyer_esc" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 20,
      shippingPriceUsd: 5,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 20,
      shippingPriceUsd: 5,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentMethod: OrderPaymentMethod.escrow,
    });

    const event = checkoutCompletedSession({
      eventId: "evt_escrow_skip",
      sessionId: "cs_escrow_skip",
      kind: "buy_now",
      orderId: order.id,
      listingId: listing.id,
      buyerId: buyer.id,
    });

    await processStripeWebhookEvent(event);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.paymentStatus).toBe(PAYMENT_PENDING);
    expect(updated?.status).toBe("pending");
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("active");
  });

  it("checkout.session.expired deletes pending buy-now order", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw2@test.internal", username: "swseller2" });
    const buyer = await seedUser(prisma, { email: "swb2@test.internal", username: "swbuyer2" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 15,
      shippingPriceUsd: 3,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 15,
      shippingPriceUsd: 3,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      stripeCheckoutSessionId: "cs_expiring",
    });

    const event = {
      type: "checkout.session.expired",
      id: "evt_expired_bn",
      data: {
        object: {
          id: "cs_expiring",
          metadata: { kind: "buy_now", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const gone = await prisma.order.findUnique({ where: { id: order.id } });
    expect(gone).toBeNull();
  });

  it("payment_intent.payment_failed deletes pending buy-now order", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw3@test.internal", username: "swseller3" });
    const buyer = await seedUser(prisma, { email: "swb3@test.internal", username: "swbuyer3" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 12,
      shippingPriceUsd: 2,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 12,
      shippingPriceUsd: 2,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
    });

    const event = {
      type: "payment_intent.payment_failed",
      id: "evt_pi_fail_bn",
      data: {
        object: {
          id: "pi_fail_bn",
          amount: 1400,
          currency: "usd",
          metadata: { kind: "buy_now", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(await prisma.order.findUnique({ where: { id: order.id } })).toBeNull();
  });

  it("payment_intent.payment_failed on pay_order leaves order failed and retryable", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw4@test.internal", username: "swseller4" });
    const buyer = await seedUser(prisma, { email: "swb4@test.internal", username: "swbuyer4" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
    });

    const event = {
      type: "payment_intent.payment_failed",
      id: "evt_pi_fail_po",
      data: {
        object: {
          id: "pi_fail_po",
          amount: 4400,
          currency: "usd",
          metadata: { kind: "pay_order", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const failed = await prisma.order.findUnique({ where: { id: order.id } });
    expect(failed?.paymentStatus).toBe(PAYMENT_FAILED);
    expect(failed?.status).toBe("cancelled");

    const { url } = await createPayOrderCheckoutSession({
      buyerId: buyer.id,
      orderId: order.id,
    });
    expect(url).toBe("https://checkout.test/session");
    expect(hoisted.stripeApi.checkout.sessions.create).toHaveBeenCalled();

    const retry = await prisma.order.findUnique({ where: { id: order.id } });
    expect(retry?.paymentStatus).toBe(PAYMENT_PENDING);
    expect(retry?.stripeCheckoutSessionId).toBe("cs_test_new");
  });

  it("payment_intent.payment_failed moves payment_requires_action order to failed", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw7@test.internal", username: "swseller7" });
    const buyer = await seedUser(prisma, { email: "swb7@test.internal", username: "swbuyer7" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_REQUIRES_ACTION,
      status: "pending",
      stripePaymentIntentId: "pi_action_failed",
    });

    const event = {
      type: "payment_intent.payment_failed",
      id: "evt_pi_fail_ra",
      data: {
        object: {
          id: "pi_action_failed",
          amount: 4400,
          currency: "usd",
          metadata: { kind: "pay_order_saved_pm", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const failed = await prisma.order.findUnique({ where: { id: order.id } });
    expect(failed?.paymentStatus).toBe(PAYMENT_FAILED);
    expect(failed?.status).toBe("cancelled");
  });

  it("payment_intent.succeeded finalizes order when kind is pay_order_saved_pm and amount matches", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw8@test.internal", username: "swseller8" });
    const buyer = await seedUser(prisma, { email: "swb8@test.internal", username: "swbuyer8" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      paymentLabel: "pm_123456789012345678901234",
    });

    const event = {
      type: "payment_intent.succeeded",
      id: "evt_pi_ok_saved",
      data: {
        object: {
          id: "pi_ok_saved",
          amount: 4400,
          currency: "usd",
          metadata: { kind: "pay_order_saved_pm", orderId: order.id, listingId: listing.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const paid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paid?.paymentStatus).toBe(PAYMENT_PAID);
    expect(paid?.stripePaymentIntentId).toBe("pi_ok_saved");
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("sold");
  });

  it("payment_intent.succeeded is ignored when metadata.kind is missing", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw9@test.internal", username: "swseller9" });
    const buyer = await seedUser(prisma, { email: "swb9@test.internal", username: "swbuyer9" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const event = {
      type: "payment_intent.succeeded",
      id: "evt_pi_no_kind",
      data: {
        object: {
          id: "pi_no_kind",
          amount: 4400,
          currency: "usd",
          metadata: { orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.paymentStatus).toBe(PAYMENT_PENDING);
  });

  it("payment_intent.succeeded is ignored for unexpected metadata.kind", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw10@test.internal", username: "swseller10" });
    const buyer = await seedUser(prisma, { email: "swb10@test.internal", username: "swbuyer10" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const event = {
      type: "payment_intent.succeeded",
      id: "evt_pi_bad_kind",
      data: {
        object: {
          id: "pi_bad_kind",
          amount: 4400,
          currency: "usd",
          metadata: { kind: "invoice", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.paymentStatus).toBe(PAYMENT_PENDING);
  });

  it("payment_intent.succeeded is ignored when amount does not match order total", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw11@test.internal", username: "swseller11" });
    const buyer = await seedUser(prisma, { email: "swb11@test.internal", username: "swbuyer11" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const event = {
      type: "payment_intent.succeeded",
      id: "evt_pi_amt",
      data: {
        object: {
          id: "pi_amt_bad",
          amount: 100,
          currency: "usd",
          metadata: { kind: "pay_order", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.paymentStatus).toBe(PAYMENT_PENDING);
  });

  it("payment_intent.succeeded is ignored when PI customer does not match buyer Stripe customer", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw12@test.internal", username: "swseller12" });
    const buyer = await seedUser(prisma, { email: "swb12@test.internal", username: "swbuyer12" });
    await prisma.user.update({
      where: { id: buyer.id },
      data: { stripeCustomerId: "cus_expected_webhook_buyer" },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 10,
      shippingPriceUsd: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 40,
      shippingPriceUsd: 4,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentDeadlineAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const event = {
      type: "payment_intent.succeeded",
      id: "evt_pi_cust",
      data: {
        object: {
          id: "pi_cust_bad",
          amount: 4400,
          currency: "usd",
          customer: "cus_different_attacker",
          metadata: { kind: "pay_order", orderId: order.id },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.paymentStatus).toBe(PAYMENT_PENDING);
  });

  it("duplicate Stripe webhook delivery is skipped safely (HTTP route)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "sw5@test.internal", username: "swseller5" });
    const buyer = await seedUser(prisma, { email: "swb5@test.internal", username: "swbuyer5" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 8,
      shippingPriceUsd: 2,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 8,
      shippingPriceUsd: 2,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
    });

    const event = checkoutCompletedSession({
      eventId: "evt_dup_stable",
      sessionId: "cs_dup",
      kind: "buy_now",
      orderId: order.id,
      listingId: listing.id,
      buyerId: buyer.id,
    });
    hoisted.constructStripeWebhookEvent.mockReturnValue(event);

    const body = JSON.stringify({ mirror: 1 });
    const res1 = await stripeWebhookPOST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=abc" },
        body,
      }),
    );
    expect(res1.status).toBe(200);

    const res2 = await stripeWebhookPOST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=def" },
        body: JSON.stringify({ mirror: 2 }),
      }),
    );
    expect(res2.status).toBe(200);
    const j2 = (await res2.json()) as { duplicate?: boolean };
    expect(j2.duplicate).toBe(true);

    const logs = await prisma.webhookEventLog.findMany({
      where: { source: "stripe", externalId: "evt_dup_stable" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.length).toBe(2);
    expect(logs.filter((l) => l.processed).length).toBe(2);
  });

  it("createBuyNowCheckoutSession deletes order when Stripe session create throws", async () => {
    hoisted.stripeApi.checkout.sessions.create.mockRejectedValueOnce(new Error("stripe_down"));
    const seller = await seedSellerStripeReady(prisma, { email: "sw6@test.internal", username: "swseller6" });
    const buyer = await seedUser(prisma, { email: "swb6@test.internal", username: "swbuyer6" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 9,
      shippingPriceUsd: 1,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });

    await expect(
      createBuyNowCheckoutSession({
        buyerId: buyer.id,
        listingId: listing.id,
        shipping: {
          shipRecipientName: "A",
          shipAddress: "1 St",
          shipCity: "Austin",
          shipState: "TX",
          shipZip: "78701",
          shipCountry: "US",
        },
      }),
    ).rejects.toThrow();

    const orders = await prisma.order.findMany({ where: { listingId: listing.id } });
    expect(orders.length).toBe(0);
  });
});
