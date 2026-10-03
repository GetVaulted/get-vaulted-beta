import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { SELLER_COMMERCE_KIND } from "@/lib/seller-commerce-event";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedOrder,
  seedPaidOrder,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const hoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  fulfillAfterPayment: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: hoisted.getServerSession,
}));

vi.mock("@/services/shipping", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/shipping")>();
  return {
    ...actual,
    fulfillOrderShippingAfterPayment: hoisted.fulfillAfterPayment,
  };
});

describe("fulfillment: label API + Shippo webhook (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_integration_dummy_key_12345");
    await bootstrapIntegrationPrisma();
    const labelRoute = await import("@/app/api/account/sales/[orderId]/create-label/route");
    const shippoRoute = await import("@/app/api/shippo/webhook/route");
    (globalThis as unknown as { __postLabel: typeof labelRoute.POST }).__postLabel = labelRoute.POST;
    (globalThis as unknown as { __postShippo: typeof shippoRoute.POST }).__postShippo = shippoRoute.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  let postCreateLabel: (req: Request, ctx: { params: Promise<{ orderId: string }> }) => Promise<Response>;
  let postShippoWebhook: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    postCreateLabel = (globalThis as unknown as { __postLabel: typeof postCreateLabel }).__postLabel;
    postShippoWebhook = (globalThis as unknown as { __postShippo: typeof postShippoWebhook }).__postShippo;
    hoisted.fulfillAfterPayment.mockReset();
    hoisted.fulfillAfterPayment.mockImplementation(async (orderId: string) => {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          shippoTransactionId: "txn_label_ok",
          labelUrl: "https://label.example/l.pdf",
          fulfillmentStatus: "label_created",
          trackingNumber: "TRK1",
          trackingUrl: "https://track.example/1",
        },
      });
    });
    await resetIntegrationDatabase(prisma);
  });

  it("paid order can create label (seller POST)", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, { email: "fl1@test.internal", username: "flseller1" });
    const buyer = await seedUser(prisma, { email: "flb1@test.internal", username: "flbuyer1" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 2,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedPaidOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 10,
      shippingPriceUsd: 2,
    });
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await postCreateLabel(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ orderId: order.id }),
    });
    expect(res.status).toBe(200);
    expect(hoisted.fulfillAfterPayment).toHaveBeenCalledWith(order.id);
    const next = await prisma.order.findUnique({ where: { id: order.id } });
    expect(next?.shippoTransactionId).toBe("txn_label_ok");
    expect(next?.labelUrl).toContain("label.example");
  });

  it("unpaid order cannot create label", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, { email: "fl2@test.internal", username: "flseller2" });
    const buyer = await seedUser(prisma, { email: "flb2@test.internal", username: "flbuyer2" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 11,
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
      itemPriceUsd: 11,
      shippingPriceUsd: 2,
      paymentStatus: "pending_payment",
      status: "pending",
    });
    hoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await postCreateLabel(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ orderId: order.id }),
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { code?: string };
    expect(j.code).toBe("UNPAID");
    expect(hoisted.fulfillAfterPayment).not.toHaveBeenCalled();
  });

  it("Shippo tracking webhook updates fulfillment and logs commerce events on transitions", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, { email: "fl3@test.internal", username: "flseller3" });
    const buyer = await seedUser(prisma, { email: "flb3@test.internal", username: "flbuyer3" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      title: "Shippo webhook card",
      priceUsd: 20,
      shippingPriceUsd: 3,
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const order = await seedPaidOrder(prisma, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemPriceUsd: 20,
      shippingPriceUsd: 3,
      shippoTransactionId: "txn_ship_webhook",
      fulfillmentStatus: "label_created",
    });

    const transitBody = JSON.stringify({
      event: "track_updated",
      data: {
        transaction: "txn_ship_webhook",
        tracking_number: "1Z999",
        tracking_status: { status: "TRANSIT" },
      },
    });
    const r1 = await postShippoWebhook(
      new Request("http://localhost/api/shippo/webhook", { method: "POST", body: transitBody }),
    );
    expect(r1.status).toBe(200);

    const mid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(mid?.fulfillmentStatus).toBe("in_transit");
    expect(mid?.status).toBe("shipped");
    expect(mid?.shippedAt).toBeTruthy();

    const buyerTransitNotifications = await prisma.notification.findMany({
      where: { userId: buyer.id, type: { in: ["order_shipped", "order_in_transit"] } },
    });
    expect(buyerTransitNotifications.some((n) => n.type === "order_shipped")).toBe(true);
    expect(buyerTransitNotifications.some((n) => n.type === "order_in_transit")).toBe(true);

    const eventsAfterTransit = await prisma.sellerCommerceEvent.findMany({
      where: { sellerId: seller.id, orderId: order.id },
    });
    expect(eventsAfterTransit.some((e) => e.kind === SELLER_COMMERCE_KIND.fulfillmentInTransit)).toBe(true);

    const ofdBody = JSON.stringify({
      event: "track_updated",
      data: {
        transaction: "txn_ship_webhook",
        tracking_number: "1Z999",
        tracking_status: { status: "OUT_FOR_DELIVERY" },
      },
    });
    const rOfd = await postShippoWebhook(
      new Request("http://localhost/api/shippo/webhook", { method: "POST", body: ofdBody }),
    );
    expect(rOfd.status).toBe(200);

    const ofd = await prisma.order.findUnique({ where: { id: order.id } });
    expect(ofd?.fulfillmentStatus).toBe("out_for_delivery");

    const ofdNotifications = await prisma.notification.findMany({
      where: { userId: buyer.id, type: "order_out_for_delivery" },
    });
    expect(ofdNotifications.length).toBe(1);

    const deliveredBody = JSON.stringify({
      event: "track_updated",
      data: {
        transaction: "txn_ship_webhook",
        tracking_number: "1Z999",
        tracking_status: { status: "DELIVERED" },
      },
    });
    const r2 = await postShippoWebhook(
      new Request("http://localhost/api/shippo/webhook", { method: "POST", body: deliveredBody }),
    );
    expect(r2.status).toBe(200);

    const end = await prisma.order.findUnique({ where: { id: order.id } });
    expect(end?.fulfillmentStatus).toBe("delivered");
    expect(end?.status).toBe("delivered");
    expect(end?.deliveryConfirmedAt).toBeTruthy();

    const eventsFinal = await prisma.sellerCommerceEvent.findMany({
      where: { sellerId: seller.id, orderId: order.id },
    });
    expect(eventsFinal.some((e) => e.kind === SELLER_COMMERCE_KIND.fulfillmentDelivered)).toBe(true);
  });
});
