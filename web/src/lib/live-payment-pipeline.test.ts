import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/buyer-live-wallet-readiness", () => ({
  getBuyerLiveWalletReadiness: vi.fn().mockResolvedValue({ paymentReady: true, shippingReady: true }),
}));

const releaseVariantPurchaseOnCheckoutExpired = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const finalizeLiveItemVariantPurchasePaid = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/live-item-variant-purchase", () => ({
  releaseVariantPurchaseOnCheckoutExpired,
  finalizeLiveItemVariantPurchasePaid,
}));

const recordLiveRoomPaymentFailure = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "failure_1", failureReason: "Payment failed." }),
);
vi.mock("@/lib/live-room-payment-failure", () => ({
  recordLiveRoomPaymentFailure,
  recordPaymentFailureFromCharge: vi.fn(),
}));

vi.mock("@/lib/live-buy-now-purchase", () => ({
  createLiveBuyNowOrder: vi.fn(),
  finalizeBreakSpotPaid: vi.fn(),
  releaseBreakSpotOnDefiniteFailure: vi.fn(),
  refreshBuyerShippingOnOrderIfIncomplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/live-show-gmv", () => ({
  resolveCheckoutApplicationFeeCents: vi.fn().mockResolvedValue(0),
}));

const ensureVariantPurchaseFulfillmentOrder = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ orderId: "order_1", chargeTotalUsd: 35 }),
);
vi.mock("@/services/shipping/live-commerce-fulfillment-order", () => ({
  ensureBreakSpotFulfillmentOrder: vi.fn(),
  ensureVariantPurchaseFulfillmentOrder,
}));
vi.mock("@/services/shipping/live-commerce-shipping-settlement", () => ({
  syncOrderShippingFromLiveSessionTx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/seller-stripe-collect-ready", () => ({
  liveSavedCardSellerReady: vi.fn().mockReturnValue(true),
  sellerStripeCollectSelect: {},
  resolveLiveSellerPayoutProcessor: vi.fn().mockReturnValue("STRIPE"),
  resolveLiveSellerDestinationAccount: vi.fn().mockReturnValue("acct_test_1"),
}));
vi.mock("@/lib/stripe-customer", () => ({
  assertPaymentMethodOwnedByUser: vi.fn().mockResolvedValue(undefined),
  getBuyerDefaultCardPaymentMethodId: vi.fn().mockResolvedValue("pm_1"),
  getBuyerPreferredWalletPaymentMethodId: vi.fn().mockResolvedValue("pm_1"),
}));
vi.mock("@/lib/stripe-payment-method-id", () => ({ isStripePaymentMethodId: vi.fn().mockReturnValue(false) }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveRoomQueueItemsChanged: vi.fn() }));

const hoistedStripe = vi.hoisted(() => ({
  stripeApi: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => hoistedStripe.stripeApi,
  isStripeConfigured: vi.fn().mockReturnValue(true),
}));

const prismaMock = vi.hoisted(() => ({
  liveItemVariantPurchase: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findUnique: vi.fn(),
  },
  order: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  LIVE_VARIANT_PURCHASE_PI_KIND,
  liveSavedCardStripeIdempotencyKey,
  settleLiveItemVariantPurchase,
} from "@/lib/live-payment-pipeline";

function baseVariantPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "vp_1",
    buyerId: "buyer_1",
    paymentStatus: "pending_payment",
    totalUsd: 35,
    variantId: "variant_1",
    liveRoomId: "room_1",
    liveRoomItemId: "item_1",
    stripePaymentIntentId: null,
    variant: { label: "Team A" },
    liveRoom: { id: "room_1", sellerId: "seller_1", status: "live" },
    ...overrides,
  };
}

describe("live-payment-pipeline", () => {
  it("uses a dedicated PaymentIntent kind for saved-card variant purchases", () => {
    expect(LIVE_VARIANT_PURCHASE_PI_KIND).toBe("variant_purchase_saved_pm");
  });

  it("changes Stripe idempotency key after a dead intent is cleared", () => {
    const base = {
      prefix: "variant_saved_pm",
      referenceId: "pur_1",
      amountCents: 3500,
      paymentMethodId: "pm_1",
    };
    const first = liveSavedCardStripeIdempotencyKey(base);
    const retry = liveSavedCardStripeIdempotencyKey({
      ...base,
      clearedDeadIntentId: "pi_dead",
    });
    expect(first).not.toBe(retry);
    expect(retry).toContain("_after_pi_dead");
  });

  it("FIX 5: is stable across repeated/near-simultaneous calls for the same purchase attempt (no wall-clock component)", () => {
    const args = {
      prefix: "variant_saved_pm",
      referenceId: "pur_1",
      amountCents: 3500,
      paymentMethodId: "pm_1",
    };
    const keyA = liveSavedCardStripeIdempotencyKey(args);
    const keyB = liveSavedCardStripeIdempotencyKey(args);
    expect(keyA).toBe(keyB);
    expect(keyA).toBe("variant_saved_pm_pur_1_3500_pm_1");
  });

  it("FIX 5: differs per purchase id / amount / payment method (still scoped correctly)", () => {
    const base = {
      prefix: "variant_saved_pm",
      referenceId: "pur_1",
      amountCents: 3500,
      paymentMethodId: "pm_1",
    };
    expect(liveSavedCardStripeIdempotencyKey(base)).not.toBe(
      liveSavedCardStripeIdempotencyKey({ ...base, referenceId: "pur_2" }),
    );
    expect(liveSavedCardStripeIdempotencyKey(base)).not.toBe(
      liveSavedCardStripeIdempotencyKey({ ...base, amountCents: 4000 }),
    );
    expect(liveSavedCardStripeIdempotencyKey(base)).not.toBe(
      liveSavedCardStripeIdempotencyKey({ ...base, paymentMethodId: "pm_2" }),
    );
  });
});

describe("settleLiveItemVariantPurchase — FIX 1: definite-failure gating on inventory release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoistedStripe.stripeApi.paymentIntents.create.mockReset();
    hoistedStripe.stripeApi.paymentIntents.retrieve.mockReset();

    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue({
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
      totalUsd: 35,
      variant: { label: "Team A" },
    });
    prismaMock.liveItemVariantPurchase.findFirst.mockResolvedValue(baseVariantPurchase());
    prismaMock.liveItemVariantPurchase.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.user.findUnique.mockImplementation(
      async ({ select }: { select: Record<string, boolean> }) => {
        if ("stripeCustomerId" in select) return { stripeCustomerId: "cus_1" };
        return { stripeAccountId: "acct_1" };
      },
    );
    prismaMock.order.findUnique.mockResolvedValue(null);
    recordLiveRoomPaymentFailure.mockResolvedValue({ id: "failure_1", failureReason: "Payment failed." });
  });

  it("does NOT release the held purchase on an ambiguous/network Stripe error (definiteFailure: false)", async () => {
    hoistedStripe.stripeApi.paymentIntents.create.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        message: "connection reset",
      } as unknown as ConstructorParameters<typeof Stripe.errors.StripeConnectionError>[0]),
    );

    const result = await settleLiveItemVariantPurchase({ buyerId: "buyer_1", purchaseId: "vp_1" });

    expect(result.ok).toBe(false);
    expect(releaseVariantPurchaseOnCheckoutExpired).not.toHaveBeenCalled();
  });

  it("DOES release the held purchase on a confirmed-definite Stripe card decline (definiteFailure: true)", async () => {
    hoistedStripe.stripeApi.paymentIntents.create.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        message: "Your card was declined.",
        payment_intent: { id: "pi_declined_1", status: "requires_payment_method" },
      } as unknown as ConstructorParameters<typeof Stripe.errors.StripeCardError>[0]),
    );

    const result = await settleLiveItemVariantPurchase({ buyerId: "buyer_1", purchaseId: "vp_1" });

    expect(result.ok).toBe(false);
    expect(releaseVariantPurchaseOnCheckoutExpired).toHaveBeenCalledWith("vp_1");
  });

  it("still marks the purchase paid and skips release entirely on a successful charge", async () => {
    hoistedStripe.stripeApi.paymentIntents.create.mockResolvedValue({
      id: "pi_ok_1",
      status: "succeeded",
    });

    const result = await settleLiveItemVariantPurchase({ buyerId: "buyer_1", purchaseId: "vp_1" });

    expect(result).toEqual(expect.objectContaining({ ok: true, paid: true }));
    expect(releaseVariantPurchaseOnCheckoutExpired).not.toHaveBeenCalled();
    expect(finalizeLiveItemVariantPurchasePaid).toHaveBeenCalledTimes(1);
  });
});
