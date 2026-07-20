import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (chaos engineering audit): `finalizeStripeMarketplaceOrderPaid` is invoked from
// multiple independent triggers for the same order — the Stripe webhook
// (`checkout.session.completed` / `payment_intent.succeeded`) and the client-initiated
// `confirmMarketplaceCheckoutSession` fallback can both race in after reading `paymentStatus` as
// not-yet-paid. Before this fix, both callers would run the full finalize flow, sending duplicate
// buyer/seller notifications, double-initializing payout, and double-recording live-show GMV. The
// order row must now be claimed atomically via `updateMany` so only one caller's side effects run.

const createNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const initializeOrderPayoutOnPayment = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const consumeListingInventoryHoldTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordLiveShowCompletedSaleTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const closeActiveLayawaysSupersededByMarketplacePurchaseTx = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/stripe-tax", () => ({
  fetchCheckoutSessionTax: vi.fn().mockResolvedValue(null),
  fetchPaymentIntentTax: vi.fn().mockResolvedValue(null),
  recordStripeTaxTransaction: vi.fn().mockResolvedValue(undefined),
  TAX_PROVIDER_STRIPE: "stripe",
}));
vi.mock("@/lib/stripe-checkout-breakdown", () => ({
  fetchCheckoutSessionChargeBreakdown: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({
  emitOrderLifecycleSync: vi.fn(),
  emitLayawayLifecycleSync: vi.fn(),
}));
vi.mock("@/lib/sales-tax-reporting", () => ({
  recordTaxDestinationVolumeOnOrderPaid: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/live-auction-inventory-hold", () => ({
  consumeListingInventoryHoldTx,
  releaseActiveInventoryHoldFromBuyNowStripeMetadata: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldsForListingAndBuyerTx: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldsForOrderId: vi.fn().mockResolvedValue(undefined),
  reserveListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/live-show-gmv", () => ({
  getLiveRoomCompletedSalesGmvUsd: vi.fn(),
  recordLiveShowCompletedSaleTx,
  resolveCheckoutApplicationFeeCents: vi.fn(),
  resolveLiveRoomIdForLiveRoomItem: vi.fn(),
  resolveLiveRoomIdForOrder: vi.fn(),
  ensureOrderPlatformFeeSnapshotPersisted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/payout/process-delivery-payout", () => ({
  initializeOrderPayoutOnPayment,
}));
vi.mock("@/services/layaway", () => ({
  closeActiveLayawaysSupersededByMarketplacePurchaseTx,
  refundSupersededLayawayPayments: vi.fn().mockResolvedValue(undefined),
}));

const orderRow = {
  id: "order_1",
  listingId: "listing_1",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  paymentStatus: "pending_payment",
  paymentMethod: "stripe",
  shippingPriceUsd: 5,
  itemPriceUsd: 100,
  taxUsd: 0,
  taxAmountCents: 0,
  stripeTaxCalculationId: null,
  shipState: "CA",
  shipCountry: "US",
  liveShippingSession: null,
  listing: { title: "Test Listing", buyingFormat: "buy_now" },
};

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  listing: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  // `closeActiveLayawaysSupersededByMarketplacePurchaseTx` is mocked at the service-module level
  // below, but defensively stub the raw `layaway` table too in case module mocking doesn't apply
  // (e.g. a dynamic `await import("@/services/layaway")` inside the transaction under test).
  layaway: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("finalizeStripeMarketplaceOrderPaid — concurrent-finalize race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue(orderRow);
  });

  // The first dynamic `await import("@/services/payments")` in this file cold-loads a large
  // dependency graph and can exceed vitest's default 5s per-test timeout in slower CI/sandbox
  // environments — not a hang, just a slow cold import. Give these a longer budget.
  const SLOW_IMPORT_TIMEOUT_MS = 20_000;

  it(
    "skips every side effect when the CAS claim loses (count 0)",
    async () => {
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

      const { finalizeStripeMarketplaceOrderPaid } = await import("@/services/payments");
      await finalizeStripeMarketplaceOrderPaid("order_1", "pi_1", "cs_1");

      expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order_1", paymentStatus: { notIn: ["paid", "expired"] } },
        }),
      );
      expect(prismaMock.listing.updateMany).not.toHaveBeenCalled();
      expect(consumeListingInventoryHoldTx).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
      expect(initializeOrderPayoutOnPayment).not.toHaveBeenCalled();
    },
    SLOW_IMPORT_TIMEOUT_MS,
  );

  it(
    "runs every side effect exactly once when the CAS claim wins (count 1)",
    async () => {
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

      const { finalizeStripeMarketplaceOrderPaid } = await import("@/services/payments");
      await finalizeStripeMarketplaceOrderPaid("order_1", "pi_1", "cs_1");

      expect(prismaMock.listing.updateMany).toHaveBeenCalledTimes(1);
      expect(consumeListingInventoryHoldTx).toHaveBeenCalledTimes(1);
      expect(createNotification).toHaveBeenCalledTimes(2);
      expect(initializeOrderPayoutOnPayment).toHaveBeenCalledTimes(1);
    },
    SLOW_IMPORT_TIMEOUT_MS,
  );

  it("only lets one of two concurrent invocations run side effects", async () => {
    // Simulate the real race: both callers read the order as not-yet-paid, but the DB serializes
    // the `updateMany` claims so only the first one actually flips the status.
    let claimed = false;
    prismaMock.order.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });

    const { finalizeStripeMarketplaceOrderPaid } = await import("@/services/payments");
    await Promise.all([
      finalizeStripeMarketplaceOrderPaid("order_1", "pi_1", "cs_1"),
      finalizeStripeMarketplaceOrderPaid("order_1", "pi_1", "cs_1"),
    ]);

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(initializeOrderPayoutOnPayment).toHaveBeenCalledTimes(1);
  });
});
