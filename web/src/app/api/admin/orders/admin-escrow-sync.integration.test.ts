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

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getEscrowTransactionStatus: vi.fn(),
  releaseFunds: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

vi.mock("@/services/escrow/factory", () => ({
  getEscrowProvider: () => ({
    name: "trustap" as const,
    createEscrowTransaction: vi.fn(),
    releaseFunds: sessionHoisted.releaseFunds,
    cancelEscrowTransaction: vi.fn(),
    getEscrowTransactionStatus: sessionHoisted.getEscrowTransactionStatus,
  }),
}));

describe("Admin POST /api/admin/orders/[id]/escrow sync", () => {
  let adminEscrowPOST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("TRUSTAP_API_KEY", "test_key");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.com");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");
    await bootstrapIntegrationPrisma();
    const mod = await import("@/app/api/admin/orders/[id]/escrow/route");
    adminEscrowPOST = mod.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    sessionHoisted.getServerSession.mockReset();
    sessionHoisted.getEscrowTransactionStatus.mockReset();
    sessionHoisted.releaseFunds.mockReset();
  });

  it("sync action updates order escrowStatus from provider", async () => {
    const admin = await seedUser(prisma, {
      email: "adm_esc@test.internal",
      username: "adminesc1",
      role: "admin",
    });
    const seller = await seedSellerStripeReady(prisma, { email: "sad1@test.internal", username: "sadlseller1" });
    const buyer = await seedUser(prisma, { email: "bad1@test.internal", username: "badlbuyer1" });
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
      paymentStatus: "paid",
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_sync_1",
      escrowStatus: EscrowStatus.pending,
      escrowProvider: "trustap",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });
    sessionHoisted.getEscrowTransactionStatus.mockResolvedValue({
      status: EscrowStatus.buyer_paid,
      raw: { test: true },
    });

    const res = await adminEscrowPOST(
      new Request("http://localhost/api/admin/orders/x/escrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(200);
    const j = (await res.json()) as { escrowStatus?: string };
    expect(j.escrowStatus).toBe(EscrowStatus.buyer_paid);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.buyer_paid);

    expect(sessionHoisted.getEscrowTransactionStatus).toHaveBeenCalledWith("tx_admin_sync_1");

    const audit = await prisma.sellerCommerceEvent.findFirst({
      where: { orderId: order.id, kind: "escrow_status" },
    });
    expect(audit).not.toBeNull();
    const body = audit?.body ? (JSON.parse(audit.body) as { source?: string; newStatus?: string }) : {};
    expect(body.source).toBe("admin");
    expect(body.newStatus).toBe(EscrowStatus.buyer_paid);
  });

  it("sync rejects provider status that would skip the state machine", async () => {
    const admin = await seedUser(prisma, {
      email: "adm_esc2@test.internal",
      username: "adminesc2",
      role: "admin",
    });
    const seller = await seedSellerStripeReady(prisma, { email: "sad2@test.internal", username: "sadlseller2" });
    const buyer = await seedUser(prisma, { email: "bad2@test.internal", username: "badlbuyer2" });
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
      paymentStatus: "paid",
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_sync_bad",
      escrowStatus: EscrowStatus.pending,
      escrowProvider: "trustap",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });
    sessionHoisted.getEscrowTransactionStatus.mockResolvedValue({
      status: EscrowStatus.funds_released,
      raw: { test: true },
    });

    const res = await adminEscrowPOST(
      new Request("http://localhost/api/admin/orders/x/escrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(409);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.pending);
  });

  it("release_funds action updates approved order when provider returns funds_released", async () => {
    const admin = await seedUser(prisma, {
      email: "adm_rf@test.internal",
      username: "adminrf1",
      role: "admin",
    });
    const seller = await seedSellerStripeReady(prisma, { email: "s_rf@test.internal", username: "seller_rf" });
    const buyer = await seedUser(prisma, { email: "b_rf@test.internal", username: "buyer_rf" });
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
      paymentStatus: "paid",
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_release_1",
      escrowStatus: EscrowStatus.approved,
      escrowProvider: "trustap",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });
    sessionHoisted.releaseFunds.mockResolvedValue({ escrowStatus: EscrowStatus.funds_released, raw: {} });

    const res = await adminEscrowPOST(
      new Request("http://localhost/api/admin/orders/x/escrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release_funds" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(200);
    expect(sessionHoisted.releaseFunds).toHaveBeenCalledWith("tx_admin_release_1");

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.escrowStatus).toBe(EscrowStatus.funds_released);
    expect(updated?.fundsReleasedAt).not.toBeNull();
  });

  it("release_funds returns 400 when escrow is not approved", async () => {
    const admin = await seedUser(prisma, {
      email: "adm_rf2@test.internal",
      username: "adminrf2",
      role: "admin",
    });
    const seller = await seedSellerStripeReady(prisma, { email: "s_rf2@test.internal", username: "seller_rf2" });
    const buyer = await seedUser(prisma, { email: "b_rf2@test.internal", username: "buyer_rf2" });
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
      paymentStatus: "paid",
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_release_bad",
      escrowStatus: EscrowStatus.delivered,
      escrowProvider: "trustap",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminEscrowPOST(
      new Request("http://localhost/api/admin/orders/x/escrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release_funds" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(400);
    expect(sessionHoisted.releaseFunds).not.toHaveBeenCalled();
  });

  it("release_funds is idempotent when funds are already released", async () => {
    const admin = await seedUser(prisma, {
      email: "adm_rf3@test.internal",
      username: "adminrf3",
      role: "admin",
    });
    const seller = await seedSellerStripeReady(prisma, { email: "s_rf3@test.internal", username: "seller_rf3" });
    const buyer = await seedUser(prisma, { email: "b_rf3@test.internal", username: "buyer_rf3" });
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
      paymentStatus: "paid",
      status: "paid",
      paymentMethod: OrderPaymentMethod.escrow,
      escrowTransactionId: "tx_admin_release_done",
      escrowStatus: EscrowStatus.funds_released,
      escrowProvider: "trustap",
    });

    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id, role: "admin" } });

    const res = await adminEscrowPOST(
      new Request("http://localhost/api/admin/orders/x/escrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release_funds" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(200);
    const j = (await res.json()) as { alreadyReleased?: boolean };
    expect(j.alreadyReleased).toBe(true);
    expect(sessionHoisted.releaseFunds).not.toHaveBeenCalled();
  });
});
