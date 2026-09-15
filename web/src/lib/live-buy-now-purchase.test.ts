import { beforeEach, describe, expect, it, vi } from "vitest";

const { isIncompleteOrderShipping, canBuyerUpdateOrderShipping } = vi.hoisted(() => ({
  isIncompleteOrderShipping: vi.fn().mockReturnValue(false),
  canBuyerUpdateOrderShipping: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("@/lib/order-shipping-guards", () => ({
  isIncompleteOrderShipping,
  canBuyerUpdateOrderShipping,
}));
vi.mock("@/lib/address-book", () => ({ isShippingAddressCompleteForLabels: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/escrow-config", () => ({
  isEscrowConfigured: vi.fn().mockReturnValue(false),
  orderTotalQualifiesForEscrow: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/live-auction-inventory-hold", () => ({
  releaseActiveInventoryHoldsForListingAndBuyerTx: vi.fn().mockResolvedValue(undefined),
  reserveListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/stripe-customer", () => ({ getBuyerDefaultCardPaymentMethodId: vi.fn() }));
vi.mock("@/lib/stripe-payment-method-id", () => ({ isStripePaymentMethodId: vi.fn().mockReturnValue(false) }));
vi.mock("@/services/shipping/live-shipping-pricing", () => ({
  addOrderToLiveShippingSessionTx: vi.fn().mockResolvedValue(undefined),
  estimateFirstItemLiveShippingCentsForListingTx: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomMessagesRefetch: vi.fn(),
  emitPurchaseCompleted: vi.fn(),
  emitBreakSpotsChanged: vi.fn(),
}));
vi.mock("@/lib/live-room-item-quantity-display", () => ({ resolveLiveBuyNowUnitSale: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/live-room-payment-notify-copy", () => ({
  liveRoomBuyerPaymentConfirmedNotification: vi.fn().mockReturnValue({ type: "x", title: "x", body: "x" }),
}));
vi.mock("@/lib/live-purchase-charge-total", () => ({
  resolveLivePurchaseNotificationChargeUsd: vi.fn().mockResolvedValue(10),
}));
vi.mock("@/services/shipping/live-item-shipping-snapshot", () => ({
  captureLiveRoomItemShippingSnapshotTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/seller-stripe-collect-ready", () => ({
  liveSavedCardSellerReady: vi.fn().mockReturnValue(true),
  sellerStripeCollectSelect: {},
}));
vi.mock("@/lib/live-giveaway", () => ({ recordBuyerGiveawayPurchaseEntries: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/shipping/break-pyt-fulfillment-bridge", () => ({
  markBreakSpotExternalFulfillmentRequired: vi.fn().mockResolvedValue(undefined),
  markVariantPurchaseExternalFulfillmentRequired: vi.fn().mockResolvedValue(undefined),
}));
const refreshLiveRoomItemSoldAfterBreakSpotChange = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/live-room-break-quantity", () => ({ refreshLiveRoomItemSoldAfterBreakSpotChange }));

const recordLiveShowCompletedSaleTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/live-show-gmv", () => ({
  recordLiveShowCompletedSaleTx,
  resolveCheckoutApplicationFeeCents: vi.fn().mockResolvedValue(0),
}));

const finalizeStripeMarketplaceOrderPaid = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/payments", () => ({
  finalizeStripeMarketplaceOrderPaid,
  PAYMENT_FAILED: "failed",
  PAYMENT_PAID: "paid",
  PAYMENT_PENDING: "pending_payment",
}));

const reportUrgentPaymentAnomaly = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportUrgentPaymentAnomaly }));

const prismaMock = vi.hoisted(() => ({
  breakSpot: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  address: { findFirst: vi.fn() },
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  applyBuyerWalletShippingToOrder,
  finalizeBreakSpotPaid,
  releaseBreakSpotOnDefiniteFailure,
  syncBuyerWalletShippingToOpenOrders,
} from "@/lib/live-buy-now-purchase";
import { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } from "@/lib/realtime-emit-server";
import { createNotification } from "@/lib/notifications";

function baseSpot(overrides: Record<string, unknown> = {}) {
  return {
    id: "spot_1",
    liveRoomId: "room_1",
    userId: "buyer_1",
    spotLabel: "Spot 1",
    priceUsd: 15,
    claimStatus: "reserved",
    breakPaymentStatus: "pending_payment",
    fulfillmentOrderId: null,
    stripePaymentIntentId: null,
    ...overrides,
  };
}

describe("finalizeBreakSpotPaid GMV double-count guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.breakSpot.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const full = baseSpot();
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(select)) picked[key] = (full as Record<string, unknown>)[key];
      return picked;
    });
  });

  it("records live-show GMV directly when there is no linked fulfillment order", async () => {
    const result = await finalizeBreakSpotPaid({ breakSpotId: "spot_1" });

    expect(finalizeStripeMarketplaceOrderPaid).not.toHaveBeenCalled();
    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledTimes(1);
    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledWith(expect.anything(), "room_1", 15);
    expect(result?.amountUsd).toBe(15);
  });

  it("does NOT double-count GMV when a fulfillment order already recorded it", async () => {
    prismaMock.breakSpot.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const full = baseSpot({ fulfillmentOrderId: "ord_1", stripePaymentIntentId: "pi_existing" });
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(select)) picked[key] = (full as Record<string, unknown>)[key];
      return picked;
    });

    await finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" });

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledWith("ord_1", "pi_1", null);
    expect(recordLiveShowCompletedSaleTx).not.toHaveBeenCalled();
  });
});

describe("finalizeBreakSpotPaid — FIX 3 atomic idempotent finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.breakSpot.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const full = baseSpot();
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(select)) picked[key] = (full as Record<string, unknown>)[key];
      return picked;
    });
    prismaMock.breakSpot.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses an atomic updateMany gated on not-already-paid, and proceeds to side effects when it wins", async () => {
    const result = await finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" });

    expect(prismaMock.breakSpot.updateMany).toHaveBeenCalledWith({
      where: { id: "spot_1", breakPaymentStatus: { not: "paid" } },
      data: expect.objectContaining({ claimStatus: "paid", breakPaymentStatus: "paid" }),
    });
    expect(emitBreakSpotsChanged).toHaveBeenCalledWith("room_1");
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(result?.amountUsd).toBe(15);
  });

  it("a losing concurrent caller (count 0) skips all paid side effects", async () => {
    prismaMock.breakSpot.updateMany.mockResolvedValueOnce({ count: 0 });

    await finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" });

    expect(emitBreakSpotsChanged).not.toHaveBeenCalled();
    expect(emitLiveRoomMessagesRefetch).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("simulated concurrent finalize calls: exactly one of two racing calls proceeds to side effects", async () => {
    let claimed = false;
    prismaMock.breakSpot.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });

    await Promise.all([
      finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" }),
      finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" }),
    ]);

    expect(emitBreakSpotsChanged).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it("still returns spot info (without re-running side effects) when already fully paid", async () => {
    prismaMock.breakSpot.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const full = baseSpot({ claimStatus: "paid", breakPaymentStatus: "paid" });
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(select)) picked[key] = (full as Record<string, unknown>)[key];
      return picked;
    });

    const result = await finalizeBreakSpotPaid({ breakSpotId: "spot_1" });

    expect(prismaMock.breakSpot.updateMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(result?.amountUsd).toBe(15);
  });
});

describe("finalizeBreakSpotPaid — FIX 4: loud alert on swallowed order finalize error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.breakSpot.updateMany.mockResolvedValue({ count: 1 });
  });

  it("alerts loudly and still marks the spot paid when finalizeStripeMarketplaceOrderPaid throws", async () => {
    finalizeStripeMarketplaceOrderPaid.mockRejectedValueOnce(new Error("order finalize boom"));
    prismaMock.breakSpot.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const full = baseSpot({ fulfillmentOrderId: "ord_1", stripePaymentIntentId: "pi_existing" });
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(select)) picked[key] = (full as Record<string, unknown>)[key];
      return picked;
    });

    await finalizeBreakSpotPaid({ breakSpotId: "spot_1", paymentIntentId: "pi_1" });

    expect(reportUrgentPaymentAnomaly).toHaveBeenCalledWith(
      "live-break-spot-order-finalize-failed",
      expect.stringContaining("MANUAL RECONCILIATION REQUIRED"),
    );
    // Stripe already charged the buyer — the spot still gets marked paid rather than silently left
    // inconsistent with no alert at all.
    expect(prismaMock.breakSpot.updateMany).toHaveBeenCalledWith({
      where: { id: "spot_1", breakPaymentStatus: { not: "paid" } },
      data: expect.objectContaining({ breakPaymentStatus: "paid" }),
    });
  });
});

describe("releaseBreakSpotOnDefiniteFailure — host cancel / abandon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.breakSpot.findUnique.mockResolvedValue(
      baseSpot({ claimStatus: "confirmed", breakPaymentStatus: "pending_payment", liveRoomItemId: "item_1" }),
    );
  });

  it("deletes the spot row and refreshes sold counts on a definite failure so it can be re-claimed", async () => {
    await releaseBreakSpotOnDefiniteFailure("spot_1");

    expect(prismaMock.breakSpot.delete).toHaveBeenCalledWith({ where: { id: "spot_1" } });
    expect(refreshLiveRoomItemSoldAfterBreakSpotChange).toHaveBeenCalledWith(expect.anything(), "item_1");
    expect(emitBreakSpotsChanged).toHaveBeenCalledWith("room_1");
  });

  it("never releases a spot that is already paid, even if called after the fact", async () => {
    prismaMock.breakSpot.findUnique.mockResolvedValue(
      baseSpot({ claimStatus: "paid", breakPaymentStatus: "paid" }),
    );

    await releaseBreakSpotOnDefiniteFailure("spot_1");

    expect(prismaMock.breakSpot.delete).not.toHaveBeenCalled();
  });

  it("is idempotent: a P2025 (already deleted by a concurrent caller) does not throw", async () => {
    prismaMock.breakSpot.delete.mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" }),
    );

    await expect(releaseBreakSpotOnDefiniteFailure("spot_1")).resolves.toBeUndefined();
  });

  it("propagates unexpected errors instead of silently swallowing them", async () => {
    prismaMock.breakSpot.delete.mockRejectedValue(new Error("db down"));

    await expect(releaseBreakSpotOnDefiniteFailure("spot_1")).rejects.toThrow("db down");
  });

  it("does nothing when the spot no longer exists", async () => {
    prismaMock.breakSpot.findUnique.mockResolvedValue(null);

    await releaseBreakSpotOnDefiniteFailure("spot_missing");

    expect(prismaMock.breakSpot.delete).not.toHaveBeenCalled();
  });
});

const walletAddr = {
  id: "addr_1",
  fullName: "Test Buyer",
  name: "Test Buyer",
  line1: "123 Main St",
  line2: null,
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
  phone: "5125550100",
};

const baseShipOrder = {
  id: "ord_1",
  buyerId: "buyer_1",
  status: "paid",
  buyerAddressId: "addr_old",
  shipRecipientName: "Old Name",
  shipAddress: "999 Test Ln",
  shipCity: "Austin",
  shipState: "TX",
  shipZip: "78701",
  shipCountry: "US",
  fulfillmentStatus: "pending",
  shippoTransactionId: null,
  labelUrl: null,
  trackingNumber: null,
};

describe("applyBuyerWalletShippingToOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canBuyerUpdateOrderShipping.mockReturnValue({ ok: true });
    isIncompleteOrderShipping.mockReturnValue(false);
    prismaMock.address.findFirst.mockResolvedValue(walletAddr);
    prismaMock.order.findUnique.mockResolvedValue(baseShipOrder);
  });

  it("copies Wallet default onto a paid pre-label order", async () => {
    const result = await applyBuyerWalletShippingToOrder("ord_1", "buyer_1");
    expect(result).toMatchObject({ ok: true, updated: true });
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: expect.objectContaining({
        shipAddress: "123 Main St",
        shipCity: "Austin",
        shipZip: "78701",
        buyerAddressId: "addr_1",
      }),
    });
  });

  it("rejects when another buyer owns the order", async () => {
    const result = await applyBuyerWalletShippingToOrder("ord_1", "other_buyer");
    expect(result).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("rejects when a label already exists", async () => {
    canBuyerUpdateOrderShipping.mockReturnValue({ ok: false, code: "LABEL_EXISTS" });
    const result = await applyBuyerWalletShippingToOrder("ord_1", "buyer_1");
    expect(result).toEqual({ ok: false, code: "LABEL_EXISTS" });
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});

describe("syncBuyerWalletShippingToOpenOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canBuyerUpdateOrderShipping.mockReturnValue({ ok: true });
    prismaMock.address.findFirst.mockResolvedValue(walletAddr);
    prismaMock.order.findMany.mockResolvedValue([baseShipOrder]);
  });

  it("updates eligible open orders from Wallet", async () => {
    const result = await syncBuyerWalletShippingToOpenOrders("buyer_1");
    expect(result.updatedOrderIds).toEqual(["ord_1"]);
    expect(prismaMock.order.update).toHaveBeenCalledTimes(1);
  });
});
