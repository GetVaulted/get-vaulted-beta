import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EscrowStatus,
  InstantPayoutStatus,
  OrderPayoutStatus,
} from "@/generated/prisma/enums";
import { sellerInstantPayoutBannerMessage } from "@/lib/seller-payout-estimate";
import { prisma } from "@/lib/prisma";
import { SUSPICIOUS_ORDER_VALUE_USD } from "@/services/payout/instant-payout-eligibility";
import {
  initializeOrderPayoutOnPayment,
  processDeliveryPayoutEvaluation,
} from "@/services/payout/process-delivery-payout";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedPaidOrder,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

async function seedEligibleSeller() {
  const seller = await seedSellerStripeAndShipFrom(prisma, {
    email: `ip_seller_${Date.now()}@test.internal`,
    username: `ipseller${Date.now()}`,
  });
  return prisma.user.update({
    where: { id: seller.id },
    data: {
      stripePayoutsEnabled: true,
      sellerSetupWizardCompletedAt: new Date(),
    },
  });
}

async function seedPaidOrderForSeller(sellerId: string, buyerId: string, opts?: { itemPriceUsd?: number; totalUsd?: number }) {
  const listing = await seedListing(prisma, {
    sellerId,
    buyingFormat: "buy_now",
    status: "sold",
    priceUsd: opts?.itemPriceUsd ?? 100,
    shippingPriceUsd: 5,
  });
  const order = await seedPaidOrder(prisma, {
    listingId: listing.id,
    buyerId,
    sellerId,
    itemPriceUsd: opts?.itemPriceUsd ?? 100,
    shippingPriceUsd: 5,
    totalUsd: opts?.totalUsd ?? (opts?.itemPriceUsd ?? 100) + 5,
    fulfillmentStatus: "shipped",
  });
  return prisma.order.update({
    where: { id: order.id },
    data: { trackingNumber: "1Z999AA10123456784" },
  });
}

describe("Instant payout QA pass (integration)", () => {
  let adminInstantPayoutPATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let adminOrderPayoutPOST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let salesGET: () => Promise<Response>;

  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
    adminInstantPayoutPATCH = (await import("@/app/api/admin/users/[id]/instant-payout/route")).PATCH;
    adminOrderPayoutPOST = (await import("@/app/api/admin/orders/[id]/payout/route")).POST;
    salesGET = (await import("@/app/api/account/sales/route")).GET;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    sessionHoisted.getServerSession.mockReset();
  });

  describe("1. New seller default state", () => {
    it("instant payout is not automatically enabled", async () => {
      const seller = await seedUser(prisma, {
        email: "new_seller@test.internal",
        username: "newseller1",
      });
      expect(seller.instantPayoutEligible).toBe(false);
      expect(seller.instantPayoutStatus).toBe(InstantPayoutStatus.ineligible);
    });

    it("seller sees correct payout eligibility message", () => {
      const msg = sellerInstantPayoutBannerMessage({
        instantPayoutEligible: false,
        instantPayoutStatus: "ineligible",
      });
      expect(msg).toContain("not enabled");
      expect(msg).toContain("Standard payout holds");
    });
  });

  describe("2. Admin enables instant payout", () => {
    it("requires reason, creates audit log, updates seller status", async () => {
      const admin = await seedUser(prisma, {
        email: "ip_admin@test.internal",
        username: "ipadmin1",
        role: "admin",
      });
      const seller = await seedEligibleSeller();

      sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id } });

      const noReason = await adminInstantPayoutPATCH(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable_instant_payout" }),
        }),
        { params: Promise.resolve({ id: seller.id }) },
      );
      expect(noReason.status).toBe(400);

      const res = await adminInstantPayoutPATCH(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable_instant_payout", reason: "Trusted beta seller" }),
        }),
        { params: Promise.resolve({ id: seller.id }) },
      );
      expect(res.status).toBe(200);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
      expect(updated.instantPayoutEligible).toBe(true);
      expect(updated.instantPayoutStatus).toBe(InstantPayoutStatus.admin_override);
      expect(updated.instantPayoutOverrideByAdmin).toBe(true);

      const audit = await prisma.payoutEligibilityAuditLog.findMany({
        where: { sellerId: seller.id, action: "seller_instant_payout_enabled" },
      });
      expect(audit.length).toBe(1);
      expect(audit[0]?.reason).toBe("Trusted beta seller");
      expect(audit[0]?.adminId).toBe(admin.id);
    });
  });

  describe("3. Order paid — payout held at sale time", () => {
    it("payoutStatus starts as held after payment init; not released", async () => {
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, { email: "ip_buyer1@test.internal", username: "ipbuyer1" });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id);

      expect(order.payoutStatus).toBe(OrderPayoutStatus.pending);

      await initializeOrderPayoutOnPayment(order.id);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.payoutStatus).toBe(OrderPayoutStatus.held);
      expect(after.payoutReleasedAt).toBeNull();
      expect(after.deliveryConfirmedAt).toBeNull();
    });
  });

  describe("4. Delivery confirmed", () => {
    it("eligible seller → instant_payout_ready then paid_out", async () => {
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, { email: "ip_buyer2@test.internal", username: "ipbuyer2" });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id);
      await initializeOrderPayoutOnPayment(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: "delivered" },
      });

      await processDeliveryPayoutEvaluation(order.id);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.payoutStatus).toBe(OrderPayoutStatus.paid_out);
      expect(after.deliveryConfirmedAt).not.toBeNull();
      expect(after.payoutReleasedAt).not.toBeNull();

      const audit = await prisma.payoutEligibilityAuditLog.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      });
      expect(audit.some((a) => a.action === "order_delivery_confirmed")).toBe(true);
      expect(audit.some((a) => a.action === "order_instant_payout_ready")).toBe(true);
      expect(audit.some((a) => a.action === "order_payout_released")).toBe(true);
    });

    it("ineligible seller → held with payoutHoldUntil", async () => {
      const seller = await seedEligibleSeller();
      await prisma.user.update({
        where: { id: seller.id },
        data: { instantPayoutStatus: InstantPayoutStatus.suspended, instantPayoutEligible: false },
      });
      const buyer = await seedUser(prisma, { email: "ip_buyer3@test.internal", username: "ipbuyer3" });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id);
      await initializeOrderPayoutOnPayment(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: "delivered" },
      });

      await processDeliveryPayoutEvaluation(order.id);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.payoutStatus).toBe(OrderPayoutStatus.held);
      expect(after.payoutHoldUntil).not.toBeNull();
      expect(after.payoutReleasedAt).toBeNull();
    });

    it("high-value order → manual_review", async () => {
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, { email: "ip_buyer4@test.internal", username: "ipbuyer4" });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id, {
        itemPriceUsd: SUSPICIOUS_ORDER_VALUE_USD,
        totalUsd: SUSPICIOUS_ORDER_VALUE_USD + 5,
      });
      await initializeOrderPayoutOnPayment(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: "delivered" },
      });

      await processDeliveryPayoutEvaluation(order.id);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.payoutStatus).toBe(OrderPayoutStatus.manual_review);
    });

    it("disputed order → blocked", async () => {
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, { email: "ip_buyer5@test.internal", username: "ipbuyer5" });
      const listing = await seedListing(prisma, {
        sellerId: seller.id,
        buyingFormat: "buy_now",
        status: "sold",
        priceUsd: 50,
      });
      const order = await seedPaidOrder(prisma, {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        itemPriceUsd: 50,
        shippingPriceUsd: 5,
        fulfillmentStatus: "delivered",
        paymentMethod: "escrow",
        escrowStatus: EscrowStatus.disputed,
        escrowTransactionId: "esc_test_1",
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { trackingNumber: "1Z999AA10123456784" },
      });
      await initializeOrderPayoutOnPayment(order.id);

      await processDeliveryPayoutEvaluation(order.id);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.payoutStatus).toBe(OrderPayoutStatus.blocked);
      expect(after.payoutBlockedReason).toContain("buyer_dispute");
    });
  });

  describe("5. Admin order override", () => {
    async function seedDeliveredOrder() {
      const admin = await seedUser(prisma, {
        email: `ip_adm_${Date.now()}@test.internal`,
        username: `ipad${Date.now()}`,
        role: "admin",
      });
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, {
        email: `ip_b_${Date.now()}@test.internal`,
        username: `ipb${Date.now()}`,
      });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id);
      await initializeOrderPayoutOnPayment(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: "delivered",
          deliveryConfirmedAt: new Date(),
          payoutStatus: OrderPayoutStatus.manual_review,
          payoutBlockedReason: "pending review",
        },
      });
      sessionHoisted.getServerSession.mockResolvedValue({ user: { id: admin.id } });
      return { admin, seller, order };
    }

    it("release, block, manual review require reason and log audit rows", async () => {
      const { order } = await seedDeliveredOrder();

      const noReason = await adminOrderPayoutPOST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "release_payout" }),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
      expect(noReason.status).toBe(400);

      const release = await adminOrderPayoutPOST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "release_payout", reason: "Review cleared" }),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
      expect(release.status).toBe(200);
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.payoutStatus).toBe(OrderPayoutStatus.paid_out);

      let audit = await prisma.payoutEligibilityAuditLog.findFirst({
        where: { orderId: order.id, action: "order_payout_released" },
      });
      expect(audit?.reason).toBe("Review cleared");

      const block = await adminOrderPayoutPOST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "block_payout", reason: "Fraud suspicion" }),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
      expect(block.status).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.payoutStatus).toBe(OrderPayoutStatus.blocked);

      audit = await prisma.payoutEligibilityAuditLog.findFirst({
        where: { orderId: order.id, action: "order_payout_blocked" },
      });
      expect(audit?.reason).toBe("Fraud suspicion");

      const review = await adminOrderPayoutPOST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "manual_review", reason: "Re-open review" }),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
      expect(review.status).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.payoutStatus).toBe(OrderPayoutStatus.manual_review);

      audit = await prisma.payoutEligibilityAuditLog.findFirst({
        where: { orderId: order.id, action: "order_manual_review" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.reason).toBe("Re-open review");
    });
  });

  describe("6. Seller UI API payload", () => {
    it("returns payout status, delivery, hold reason, and estimate", async () => {
      const seller = await seedEligibleSeller();
      const buyer = await seedUser(prisma, {
        email: `ip_ui_${Date.now()}@test.internal`,
        username: `ipui${Date.now()}`,
      });
      const order = await seedPaidOrderForSeller(seller.id, buyer.id);
      await initializeOrderPayoutOnPayment(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: "delivered",
          payoutStatus: OrderPayoutStatus.held,
          payoutBlockedReason: "awaiting_delivery",
          payoutHoldUntil: new Date(Date.now() + 7 * 86400000),
        },
      });

      sessionHoisted.getServerSession.mockResolvedValue({ user: { id: seller.id } });
      const res = await salesGET();
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        sellerPayout?: { eligibilityMessage?: string };
        orders?: Array<{
          payoutStatus: string;
          fulfillmentStatus: string;
          payoutBlockedReason: string | null;
          payoutEstimateUsd: number;
          payoutHoldUntil: string | null;
        }>;
      };

      expect(body.sellerPayout?.eligibilityMessage).toBeTruthy();
      const row = body.orders?.find((o) => o.payoutStatus === "held");
      expect(row).toBeTruthy();
      expect(row?.fulfillmentStatus).toBe("delivered");
      expect(row?.payoutBlockedReason).toBeTruthy();
      expect(row?.payoutEstimateUsd).toBeGreaterThan(0);
      expect(row?.payoutHoldUntil).toBeTruthy();
    });
  });
});
