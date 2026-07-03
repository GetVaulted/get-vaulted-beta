import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/order-shipping-guards", () => ({ isIncompleteOrderShipping: vi.fn().mockReturnValue(false) }));
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
  assertSellerStripeCollectReadyFromUser: vi.fn(),
  sellerStripeCollectSelect: {},
}));
vi.mock("@/lib/live-giveaway", () => ({ recordBuyerGiveawayPurchaseEntries: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/shipping/break-pyt-fulfillment-bridge", () => ({
  markBreakSpotExternalFulfillmentRequired: vi.fn().mockResolvedValue(undefined),
  markVariantPurchaseExternalFulfillmentRequired: vi.fn().mockResolvedValue(undefined),
}));

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

const prismaMock = vi.hoisted(() => ({
  breakSpot: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { finalizeBreakSpotPaid } from "@/lib/live-buy-now-purchase";

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
