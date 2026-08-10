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
const executeRandomVariantRevealOnPurchase = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const isRandomVariantAssignment = vi.hoisted(() => vi.fn().mockReturnValue(false));
vi.mock("@/lib/live-item-variant-random-reveal", () => ({
  executeRandomVariantRevealOnPurchase,
  isRandomVariantAssignment,
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
vi.mock("@/services/payments", () => ({ finalizeStripeMarketplaceOrderPaid, PAYMENT_REFUNDED: "refunded" }));
const executeOrderRefund = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/order-refund-request", () => ({ executeOrderRefund }));
vi.mock("@/lib/order-refund-eligibility", () => ({ ACTIVE_REFUND_REQUEST_STATUSES: ["pending_seller", "pending_admin"] }));
const reportUrgentPaymentAnomaly = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportUrgentPaymentAnomaly }));

const prismaMock = vi.hoisted(() => ({
  liveItemVariantPurchase: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  order: {
    findUnique: vi.fn(),
  },
  orderRefundRequest: {
    findFirst: vi.fn(),
    create: vi.fn(),
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
import { emitVariantPurchased } from "@/lib/realtime-emit-server";
import { createNotification } from "@/lib/notifications";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";

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
    // Already `paid` — the atomic conditional updateMany (FIX 4) matches zero rows since the where
    // clause requires `paymentStatus: "pending_payment"`, so this caller loses the claim.
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValueOnce({ count: 0 });

    await finalizeLiveItemVariantPurchasePaid("vp_1", "pi_1");

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledTimes(1);
    expect(prismaMock.liveItemVariantPurchase.update).not.toHaveBeenCalled();
    expect(recordLiveShowCompletedSaleTx).not.toHaveBeenCalled();
  });
});

describe("finalizeLiveItemVariantPurchasePaid — FIX 4 atomic idempotent finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 1 });
  });

  it("only the caller that wins the atomic updateMany proceeds to side effects", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(basePurchase());
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValueOnce({ count: 1 });

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(prismaMock.liveItemVariantPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: "vp_1", paymentStatus: "pending_payment" },
      data: expect.objectContaining({ paymentStatus: "paid" }),
    });
    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledTimes(1);
  });

  it("a losing concurrent caller (count 0) skips all reveal/notification side effects", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(basePurchase());
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValueOnce({ count: 0 });

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(recordLiveShowCompletedSaleTx).not.toHaveBeenCalled();
    expect(finalizeStripeMarketplaceOrderPaid).not.toHaveBeenCalled();
  });

  it("simulated concurrent finalize calls: exactly one of two racing calls proceeds", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(basePurchase());
    // Simulate the DB-level atomicity of updateMany: only the first caller's conditional update
    // actually matches a row; the second sees the status has already flipped to "paid".
    let claimed = false;
    prismaMock.liveItemVariantPurchase.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });

    await Promise.all([
      finalizeLiveItemVariantPurchasePaid("vp_1"),
      finalizeLiveItemVariantPurchasePaid("vp_1"),
    ]);

    expect(recordLiveShowCompletedSaleTx).toHaveBeenCalledTimes(1);
  });
});

describe("finalizeLiveItemVariantPurchasePaid — bug #18: never mislabel a PayPal id as Stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 1 });
  });

  it("Stripe live variant purchase: a real PaymentIntent id is forwarded and persisted as-is", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_stripe" }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1", "pi_3U2kAVRpBjIH1YA105xDPdno");

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledWith(
      "ord_stripe",
      "pi_3U2kAVRpBjIH1YA105xDPdno",
      null,
    );
    expect(prismaMock.liveItemVariantPurchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripePaymentIntentId: "pi_3U2kAVRpBjIH1YA105xDPdno" }),
      }),
    );
  });

  it("PayPal/Venmo live variant purchase: a PayPal capture id is never forwarded as a Stripe PaymentIntent id", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_paypal" }),
    );

    // The PayPal buyer rail returns its capture id through this same slot (see
    // chargeLiveItemVariantPurchaseWithSavedCard) — it must never reach stripePaymentIntentId.
    await finalizeLiveItemVariantPurchasePaid("vp_1", "21V88625P2888003D");

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledWith("ord_paypal", null, null);
    expect(prismaMock.liveItemVariantPurchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripePaymentIntentId: undefined }),
      }),
    );
  });

  it("falls back to a real Stripe id already on the purchase row, never a stale PayPal one", async () => {
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_fallback", stripePaymentIntentId: "21V88625P2888003D" }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(finalizeStripeMarketplaceOrderPaid).toHaveBeenCalledWith("ord_fallback", null, null);
  });
});

describe("finalizeLiveItemVariantPurchasePaid — FIX 3 refund/alert safety net", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({
      itemVersion: 1,
      title: "Mystery Box",
      salesFormat: "team_break",
      variantAssignmentMode: "random",
    });
    isRandomVariantAssignment.mockReturnValue(true);
  });

  it("alerts loudly (no auto-refund possible) when a charged purchase with no fulfillment order fails to get a reveal", async () => {
    executeRandomVariantRevealOnPurchase.mockResolvedValue(null);
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: null, totalUsd: 25 }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(reportUrgentPaymentAnomaly).toHaveBeenCalledWith(
      "live-random-reveal-unassignable",
      expect.stringContaining("MANUAL REFUND REQUIRED"),
    );
    expect(executeOrderRefund).not.toHaveBeenCalled();
  });

  it("automatically refunds via the order-refund service when a fulfillment order exists", async () => {
    executeRandomVariantRevealOnPurchase.mockResolvedValue(null);
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_1", totalUsd: 25 }),
    );
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      paymentStatus: "paid",
    });
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);
    prismaMock.orderRefundRequest.create.mockResolvedValue({ id: "refund_1" });

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(prismaMock.orderRefundRequest.create).toHaveBeenCalledTimes(1);
    expect(executeOrderRefund).toHaveBeenCalledWith("ord_1", "refund_1");
    expect(reportUrgentPaymentAnomaly).toHaveBeenCalledWith(
      "live-random-reveal-auto-refunded",
      expect.any(String),
    );
  });

  it("does not refund or alert when a label is successfully assigned", async () => {
    executeRandomVariantRevealOnPurchase.mockResolvedValue({ label: "AFC East", abbr: "AFCE" });
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_1", totalUsd: 25 }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(executeOrderRefund).not.toHaveBeenCalled();
    expect(reportUrgentPaymentAnomaly).not.toHaveBeenCalled();
    // A successful reveal SHOULD still run the normal "purchase succeeded" side effects.
    expect(emitVariantPurchased).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});

describe("finalizeLiveItemVariantPurchasePaid — FIX 4: loud alert on swallowed order finalize error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 1 });
  });

  it("alerts loudly and still marks the purchase paid when finalizeStripeMarketplaceOrderPaid throws", async () => {
    finalizeStripeMarketplaceOrderPaid.mockRejectedValueOnce(new Error("order finalize boom"));
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: "ord_1", totalUsd: 25 }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1", "pi_1");

    expect(reportUrgentPaymentAnomaly).toHaveBeenCalledWith(
      "live-variant-purchase-order-finalize-failed",
      expect.stringContaining("MANUAL RECONCILIATION REQUIRED"),
    );
    // Stripe already charged the buyer — the purchase still gets marked paid rather than silently
    // left inconsistent with no alert at all.
    expect(prismaMock.liveItemVariantPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: "vp_1", paymentStatus: "pending_payment" },
      data: expect.objectContaining({ paymentStatus: "paid" }),
    });
  });
});

describe("finalizeLiveItemVariantPurchasePaid — FIX 2: skip success side effects after a failed reveal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({
      itemVersion: 1,
      title: "Mystery Box",
      salesFormat: "team_break",
      variantAssignmentMode: "random",
    });
    isRandomVariantAssignment.mockReturnValue(true);
  });

  it("does NOT broadcast the purchase, notify the buyer, record giveaway entries, or mark break-ready when the reveal fails", async () => {
    executeRandomVariantRevealOnPurchase.mockResolvedValue(null);
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: null, totalUsd: 25 }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    // The refund/alert safety net still ran (FIX 3 behavior, unaffected by this fix)...
    expect(reportUrgentPaymentAnomaly).toHaveBeenCalledWith(
      "live-random-reveal-unassignable",
      expect.stringContaining("MANUAL REFUND REQUIRED"),
    );
    // ...but none of the "purchase succeeded" side effects should have run for this purchase.
    expect(emitVariantPurchased).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(recordBuyerGiveawayPurchaseEntries).not.toHaveBeenCalled();
    expect(maybeMarkVariantBreakReady).not.toHaveBeenCalled();
  });

  it("still runs the normal success side effects when the reveal succeeds", async () => {
    executeRandomVariantRevealOnPurchase.mockResolvedValue({ label: "AFC East", abbr: "AFCE" });
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(
      basePurchase({ fulfillmentOrderId: null, totalUsd: 25 }),
    );

    await finalizeLiveItemVariantPurchasePaid("vp_1");

    expect(emitVariantPurchased).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(recordBuyerGiveawayPurchaseEntries).toHaveBeenCalledTimes(1);
    expect(maybeMarkVariantBreakReady).toHaveBeenCalledTimes(1);
  });
});
