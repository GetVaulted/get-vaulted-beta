import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { fulfillOrderShippingAfterPayment } from "@/services/shipping";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedPaidOrder,
  seedSellerStripeAndShipFrom,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: () => true,
  shippoCreateShipment: vi.fn().mockResolvedValue({ object_id: "sh_int_1" }),
  shippoListRates: vi.fn().mockResolvedValue({
    results: [
      {
        object_id: "rate_int_1",
        amount: "6.25",
        provider: "USPS",
        servicelevel: { name: "Ground" },
      },
    ],
  }),
  shippoPurchaseRate: vi.fn().mockResolvedValue({
    object_id: "txn_int_1",
    tracking_number: "1ZTEST",
    tracking_url_provider: "https://track.example",
    label_url: "https://label.example/x.pdf",
    status: "SUCCESS",
  }),
  verifyShippoWebhookSignature: () => true,
}));

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

describe("shipping economics + admin visibility (integration)", () => {
  let adminOrderGET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo_test_token_integration");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_se_dummy");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    await bootstrapIntegrationPrisma();
    const mod = await import("@/app/api/admin/orders/[id]/route");
    adminOrderGET = mod.GET;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    sessionHoisted.getServerSession.mockReset();
  });

  it("sets shippingLabelCostCents from Shippo rate when label is purchased", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, { email: "seco1_s@test.internal", username: "secoseller1" });
    const buyer = await seedUser(prisma, { email: "seco1_b@test.internal", username: "secobuyer1" });
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
      shippingChargedCents: 200,
    });

    await fulfillOrderShippingAfterPayment(order.id);

    const next = await prisma.order.findUnique({ where: { id: order.id } });
    expect(next?.shippingLabelCostCents).toBe(625);
    expect(next?.fulfillmentStatus).toBe("label_created");
  });

  it("admin order GET exposes charged, label cost, and margin", async () => {
    const admin = await seedUser(prisma, { email: "seco_ad@test.internal", username: "secoadmin", role: "admin" });
    const seller = await seedSellerStripeReady(prisma, { email: "seco2_s@test.internal", username: "secoseller2" });
    const buyer = await seedUser(prisma, { email: "seco2_b@test.internal", username: "secobuyer2" });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 10,
      shippingPriceUsd: 1,
    });
    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        itemPriceUsd: 10,
        shippingPriceUsd: 1,
        taxUsd: 0,
        totalUsd: 11,
        status: "paid",
        paymentStatus: "paid",
        fulfillmentStatus: "label_created",
        shipRecipientName: "B",
        shipAddress: "1 St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
        shipCountry: "US",
        paymentLabel: "card",
        shippingChargedCents: 500,
        shippingLabelCostCents: 425,
      },
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminOrderGET(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      order: {
        shippingChargedCents: number | null;
        shippingLabelCostCents: number | null;
        shippingMarginCents: number | null;
      };
    };
    expect(body.order.shippingChargedCents).toBe(500);
    expect(body.order.shippingLabelCostCents).toBe(425);
    expect(body.order.shippingMarginCents).toBe(75);
  });
});
