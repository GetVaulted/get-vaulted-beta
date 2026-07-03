import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn(), isStripeConfigured: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/stripe-payment-method-config", () => ({ stripeCheckoutSessionPaymentOptions: vi.fn().mockReturnValue({}) }));
vi.mock("@/lib/stripe-tax", () => ({
  buildCheckoutTaxSessionFields: vi.fn().mockResolvedValue({}),
  STRIPE_TAX_CODE_TANGIBLE: "tangible",
  stripeLineItemProductData: vi.fn(),
}));
vi.mock("@/lib/seller-stripe-collect-ready", () => ({
  assertSellerStripeCollectReadyFromUser: vi.fn(),
  sellerStripeCollectSelect: {},
}));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomMessageById: vi.fn(),
  emitLiveRoomMessagesRefetch: vi.fn(),
  emitLiveRoomQueueItemsChanged: vi.fn(),
  emitVariantPurchased: vi.fn(),
}));
vi.mock("@/lib/live-giveaway", () => ({ recordBuyerGiveawayPurchaseEntries: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/live-room-payment-notify-copy", () => ({
  liveRoomBuyerPaymentConfirmedNotification: vi.fn().mockReturnValue({ type: "x", title: "x", body: "x" }),
}));
vi.mock("@/lib/live-purchase-charge-total", () => ({
  resolveLivePurchaseNotificationChargeUsd: vi.fn().mockResolvedValue(10),
}));
vi.mock("@/lib/live-item-variant-break", () => ({ maybeMarkVariantBreakReady: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/live-item-variant-random-reveal", () => ({
  executeRandomVariantRevealOnPurchase: vi.fn().mockResolvedValue(null),
  isRandomVariantAssignment: vi.fn().mockReturnValue(false),
}));
vi.mock("@/services/shipping/break-pyt-fulfillment-bridge", () => ({
  markVariantPurchaseExternalFulfillmentRequired: vi.fn().mockResolvedValue(undefined),
}));

const recordLiveShowCompletedSaleTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/live-show-gmv", () => ({
  recordLiveShowCompletedSaleTx,
  resolveCheckoutApplicationFeeCents: vi.fn().mockResolvedValue(0),
}));

const finalizeStripeMarketplaceOrderPaid = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/payments", () => ({ finalizeStripeMarketplaceOrderPaid }));

const prismaMock = vi.hoisted(() => ({
  liveItemVariantPurchase: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  liveItemVariant: {
    findUnique: vi.fn().mockResolvedValue({ quantityRemaining: 1, liveRoomItemId: "item_1" }),
    update: vi.fn().mockResolvedValue(undefined),
  },
  liveRoomItem: {
    findUnique: vi.fn().mockResolvedValue({ itemVersion: 1, title: "Item", salesFormat: "variant", variantAssignmentMode: "manual" }),
  },
  liveRoom: {
    findUnique: vi.fn().mockResolvedValue({ sellerId: "seller_1" }),
  },
  liveRoomMessage: {
    create: vi.fn().mockResolvedValue({ id: "msg_1" }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { finalizeLiveItemVariantPurchasePaid } from "@/lib/live-item-variant-purchase";

function basePurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "vp_1",
    paymentStatus: "pending",
    fulfillmentOrderId: null,
    totalUsd: 25,
    liveRoomId: "room_1",
    liveRoomItemId: "item_1",
    variantId: "variant_1",
    buyerId: "buyer_1",
    quantity: 1,
    stripePaymentIntentId: null,
    variant: { label: "Team A" },
    buyer: { id: "buyer_1", username: "buyer1" },
    ...overrides,
  };
}

describe("finalizeLiveItemVariantPurchasePaid GMV double-count guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records live-show GMV directly when there is no linked fulfillment order", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(basePurchase({ fulfillmentOrderId: null }));

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(finalizeStripeMarketplaceOrderPaid).not.toHaveBeenCalled();
    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledTimes(1);
    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledWith(expect.anything(), "room_1", 25);
  });

  it("does NOT double-count GMV when a fulfillment order already recorded it", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_1" }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1", "pi_1");

    // Fulfillment order path delegates GMV recording to finalizeStripeMarketplaceOrderPaid.
    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledWith("ord_1", "pi_1", null);
    expect(recordLiveShowCompletedSaleTx).not.toHaveBeenCalled();
  });

  it("is idempotent: already-paid purchases with a fulfillment order still forward finalize but skip re-processing", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_1", paymentStatus: "paid" }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1", "pi_1");

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledTimes(1);
    expect(prismaMock.liveItemVariantPurchase.update).not.toHaveBeenCalled();
    expect(recordLiveShowCompletedSaleTx).not.toHaveBeenCalled();
  });
});
