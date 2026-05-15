import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
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
import { TrustapEscrowProvider } from "@/services/escrow/trustap-provider";
import { PAYMENT_PENDING, PAYMENT_PAID, createBuyNowCheckoutSession } from "@/services/payments";

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

const stripeHoisted = vi.hoisted(() => ({
  stripeApi: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "cs_escrow_test", url: "https://checkout.test/stripe" }),
        retrieve: vi.fn().mockResolvedValue({ status: "open", url: "https://checkout.test/stripe" }),
      },
    },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => stripeHoisted.stripeApi as unknown as ReturnType<typeof actual.getStripe>,
  };
});

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("Escrow + Trustap webhooks (integration)", () => {
  let escrowWebhookPOST: (req: Request) => Promise<Response>;
  let orderApprovePOST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let adminEscrowPOST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_escrow_integration");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("TRUSTAP_API_KEY", "test_trustap_api_key");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.com");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");
    vi.stubEnv("TRUSTAP_WEBHOOK_USERNAME", "wh_user");
    vi.stubEnv("TRUSTAP_WEBHOOK_PASSWORD", "wh_pass_correct");
    await bootstrapIntegrationPrisma();
    const escrowMod = await import("@/app/api/escrow/webhook/route");
    escrowWebhookPOST = escrowMod.POST;
    const approveMod = await import("@/app/api/orders/[id]/approve/route");
    orderApprovePOST = approveMod.POST;
    const adminEscrowMod = await import("@/app/api/admin/orders/[id]/escrow/route");
    adminEscrowPOST = adminEscrowMod.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "");
    await resetIntegrationDatabase(prisma);
    stripeHoisted.stripeApi.checkout.sessions.create.mockClear();
    stripeHoisted.stripeApi.checkout.sessions.retrieve.mockClear();
    sessionHoisted.getServerSession.mockReset();
  });

  it("rejects escrow webhook without valid Basic auth", async () => {
    const res = await escrowWebhookPOST(
      new Request("http://localhost/api/escrow/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "basic_tx.paid", target_id: "1" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects escrow webhook with wrong Basic password", async () => {
    const res = await escrowWebhookPOST(
      new Request("http://localhost/api/escrow/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: basicAuthHeader("wh_user", "wrong"),
        },
        body: JSON.stringify({ code: "basic_tx.paid", target_id: "99" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("basic_tx.paid webhook marks escrow order paid and listing sold", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "es1@test.internal", username: "eseller1" });
    const buyer = await seedUser(prisma, { email: "eb1@test.internal", username: "ebuyer1" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 100,
      shippingPriceUsd: 5,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const txId = "trustap_tx_paid_1";
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 100,
      shippingPriceUsd: 5,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: txId,
      escrowStatus: EscrowStatus.pending,
    });

    const res = await escrowWebhookPOST(
      new Request("http://localhost/api/escrow/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: basicAuthHeader("wh_user", "wh_pass_correct"),
        },
        body: JSON.stringify({
          code: "basic_tx.paid",
          target_id: txId,
          metadata: { orderId: order.id },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.paymentStatus).toBe(PAYMENT_PAID);
    expect(updated?.status).toBe("paid");
    expect(updated?.escrowStatus).toBe(EscrowStatus.buyer_paid);
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("sold");

    const audit = await prisma.sellerCommerceEvent.findMany({
      where: { orderId: order.id, kind: "escrow_status" },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(audit[0]!.body) as { source?: string; newStatus?: string };
    expect(parsed.source).toBe("webhook");
    expect(parsed.newStatus).toBe(EscrowStatus.buyer_paid);
  });

  it("webhook cannot skip states (e.g. pending → funds_released)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "es_skip@test.internal", username: "esellerskip" });
    const buyer = await seedUser(prisma, { email: "eb_skip@test.internal", username: "ebuyerskip" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 50,
      shippingPriceUsd: 5,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const txId = "trustap_tx_skip_1";
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      paymentStatus: PAYMENT_PENDING,
      status: "pending",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: txId,
      escrowStatus: EscrowStatus.pending,
    });

    const res = await escrowWebhookPOST(
      new Request("http://localhost/api/escrow/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: basicAuthHeader("wh_user", "wh_pass_correct"),
        },
        body: JSON.stringify({
          code: "basic_tx.funds_released",
          target_id: txId,
          metadata: { orderId: order.id },
        }),
      }),
    );
    expect(res.status).toBe(409);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.pending);
    expect(updated?.paymentStatus).toBe(PAYMENT_PENDING);
    const list = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(list?.status).toBe("active");
  });

  it("buyer approve persists approved when provider returns approved (strict chain before funds_released)", async () => {
    const spy = vi
      .spyOn(TrustapEscrowProvider.prototype, "releaseFunds")
      .mockResolvedValue({ escrowStatus: EscrowStatus.approved, raw: { test: true } });

    const seller = await seedSellerStripeReady(prisma, { email: "es2@test.internal", username: "eseller2" });
    const buyer = await seedUser(prisma, { email: "eb2@test.internal", username: "ebuyer2" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_release_ok",
      escrowStatus: EscrowStatus.delivered,
      trustapBuyerUserId: "1-buyer-test",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("tx_release_ok");

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.approved);
    expect(updated?.fundsReleasedAt).toBeNull();
    spy.mockRestore();
  });

  it("buyer approve moves inspection_period → approved locally then provider funds_released completes chain", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "es_ip@test.internal", username: "esellerip" });
    const buyer = await seedUser(prisma, { email: "eb_ip@test.internal", username: "ebuyerip" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_release_skip_fr",
      escrowStatus: EscrowStatus.inspection_period,
      trustapBuyerUserId: "1-buyer-test",
    });

    const spy = vi.spyOn(TrustapEscrowProvider.prototype, "releaseFunds").mockImplementation(async () => {
      const row = await prisma.order.findUnique({ where: { id: order.id }, select: { escrowStatus: true } });
      expect(row?.escrowStatus).toBe(EscrowStatus.approved);
      return { escrowStatus: EscrowStatus.funds_released, raw: { test: true } };
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("tx_release_skip_fr");

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.funds_released);
    expect(updated?.fundsReleasedAt).not.toBeNull();
    spy.mockRestore();
  });

  it("buyer approve does not set fundsReleasedAt when provider stops short of funds_released", async () => {
    const spy = vi
      .spyOn(TrustapEscrowProvider.prototype, "releaseFunds")
      .mockResolvedValue({ escrowStatus: EscrowStatus.approved, raw: { test: true } });

    const seller = await seedSellerStripeReady(prisma, { email: "es3@test.internal", username: "eseller3" });
    const buyer = await seedUser(prisma, { email: "eb3@test.internal", username: "ebuyer3" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_release_partial",
      escrowStatus: EscrowStatus.inspection_period,
      trustapBuyerUserId: "1-buyer-test",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.approved);
    expect(updated?.fundsReleasedAt).toBeNull();
    spy.mockRestore();
  });

  it("buyer approve keeps order approved and returns 502 when provider release throws after local approval", async () => {
    const spy = vi.spyOn(TrustapEscrowProvider.prototype, "releaseFunds").mockRejectedValue(new Error("trustap_down"));

    const seller = await seedSellerStripeReady(prisma, { email: "es_rel_fail@test.internal", username: "esellerrelfail" });
    const buyer = await seedUser(prisma, { email: "eb_rel_fail@test.internal", username: "ebuyerrelfail" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_release_throw",
      escrowStatus: EscrowStatus.delivered,
      trustapBuyerUserId: "1-buyer-test",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { approvalSucceeded?: boolean; escrowStatus?: string; error?: string };
    expect(body.approvalSucceeded).toBe(true);
    expect(body.escrowStatus).toBe(EscrowStatus.approved);
    expect(body.error).toMatch(/approval was recorded/i);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.approved);
    expect(updated?.fundsReleasedAt).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("buyer approve returns 409 for disputed escrow and does not call releaseFunds", async () => {
    const spy = vi.spyOn(TrustapEscrowProvider.prototype, "releaseFunds");

    const seller = await seedSellerStripeReady(prisma, { email: "es4@test.internal", username: "eseller4" });
    const buyer = await seedUser(prisma, { email: "eb4@test.internal", username: "ebuyer4" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_disputed",
      escrowStatus: EscrowStatus.disputed,
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("buy-now under $5,000 uses Stripe checkout when escrow is configured", async () => {
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    const seller = await seedSellerStripeReady(prisma, { email: "es5@test.internal", username: "eseller5" });
    const buyer = await seedUser(prisma, { email: "eb5@test.internal", username: "ebuyer5" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 100,
      shippingPriceUsd: 50,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });

    const { url } = await createBuyNowCheckoutSession({
      buyerId: buyer.id,
      listingId: listing.id,
      shipping: {
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
      },
    });

    expect(url).toContain("checkout.test/stripe");
    expect(stripeHoisted.stripeApi.checkout.sessions.create).toHaveBeenCalled();
    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order?.paymentMethod).toBe(OrderPaymentMethod.stripe);
  });

  it("buy-now at or above $5,000 uses escrow when Trustap is configured (stub)", async () => {
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    const seller = await seedSellerStripeReady(prisma, { email: "es6@test.internal", username: "eseller6" });
    const buyer = await seedUser(prisma, { email: "eb6@test.internal", username: "ebuyer6" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 4980,
      shippingPriceUsd: 25,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });

    const { url } = await createBuyNowCheckoutSession({
      buyerId: buyer.id,
      listingId: listing.id,
      shipping: {
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
      },
    });

    expect(url).toContain("stub-checkout");
    expect(stripeHoisted.stripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order?.paymentMethod).toBe(OrderPaymentMethod.escrow);
    expect(order?.escrowTransactionId).toMatch(/^trustap_stub_/);
  });

  it("buyer approve when fulfillment is delivered aligns seller_shipped escrow then releases", async () => {
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");

    const seller = await seedSellerStripeReady(prisma, { email: "es7@test.internal", username: "eseller7" });
    const buyer = await seedUser(prisma, { email: "eb7@test.internal", username: "ebuyer7" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_carrier_align",
      escrowStatus: EscrowStatus.seller_shipped,
      trustapBuyerUserId: "1-buyer-test",
      fulfillmentStatus: "delivered",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: buyer.id } });

    const res = await orderApprovePOST(new Request("http://localhost/api/orders/x", { method: "POST" }), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.funds_released);
  });

  it("admin set_escrow_delivered moves seller_shipped → delivered", async () => {
    const admin = await seedUser(prisma, { email: "ead1@test.internal", username: "eadm1", role: "admin" });
    const seller = await seedSellerStripeReady(prisma, { email: "es8@test.internal", username: "eseller8" });
    const buyer = await seedUser(prisma, { email: "eb8@test.internal", username: "ebuyer8" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_del",
      escrowStatus: EscrowStatus.seller_shipped,
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminEscrowPOST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_escrow_delivered" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { escrowStatus?: string };
    expect(body.escrowStatus).toBe(EscrowStatus.delivered);
  });

  it("admin set_escrow_inspection_period moves delivered → inspection_period", async () => {
    const admin = await seedUser(prisma, { email: "ead2@test.internal", username: "eadm2", role: "admin" });
    const seller = await seedSellerStripeReady(prisma, { email: "es9@test.internal", username: "eseller9" });
    const buyer = await seedUser(prisma, { email: "eb9@test.internal", username: "ebuyer9" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_insp",
      escrowStatus: EscrowStatus.delivered,
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminEscrowPOST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_escrow_inspection_period" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { escrowStatus?: string };
    expect(body.escrowStatus).toBe(EscrowStatus.inspection_period);
  });

  it("admin set_escrow_inspection_period rejects invalid transition (buyer_paid)", async () => {
    const admin = await seedUser(prisma, { email: "ead3@test.internal", username: "eadm3", role: "admin" });
    const seller = await seedSellerStripeReady(prisma, { email: "es10@test.internal", username: "eseller10" });
    const buyer = await seedUser(prisma, { email: "eb10@test.internal", username: "ebuyer10" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await seedOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 1,
      paymentStatus: PAYMENT_PAID,
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_bad",
      escrowStatus: EscrowStatus.buyer_paid,
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminEscrowPOST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_escrow_inspection_period" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(409);
  });
});
