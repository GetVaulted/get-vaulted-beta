import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: `finalizeStripeMarketplaceOrderPaid` previously fetched Stripe checkout-session
// tax and charge-breakdown data with two sequential `await`s even though both reads are
// independent (keyed only on `sessionId`). This verifies they now run concurrently
// (performance audit 2026-07).

const fetchCheckoutSessionTax = vi.hoisted(() => vi.fn());
const fetchCheckoutSessionChargeBreakdown = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stripe-tax", () => ({
  fetchCheckoutSessionTax,
  fetchPaymentIntentTax: vi.fn().mockResolvedValue(null),
  recordStripeTaxTransaction: vi.fn().mockResolvedValue(undefined),
  TAX_PROVIDER_STRIPE: "stripe",
}));

vi.mock("@/lib/stripe-checkout-breakdown", () => ({
  fetchCheckoutSessionChargeBreakdown,
}));

vi.mock("@/lib/live-buy-now-purchase", () => ({
  resolveBuyerDefaultShippingForOrder: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({
  emitOrderLifecycleSync: vi.fn(),
  emitLayawayLifecycleSync: vi.fn(),
}));
vi.mock("@/lib/sales-tax-reporting", () => ({
  recordTaxDestinationVolumeOnOrderPaid: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/live-auction-inventory-hold", () => ({
  consumeListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldFromBuyNowStripeMetadata: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldsForListingAndBuyerTx: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldsForOrderId: vi.fn().mockResolvedValue(undefined),
  reserveListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/live-show-gmv", () => ({
  getLiveRoomCompletedSalesGmvUsd: vi.fn(),
  recordLiveShowCompletedSaleTx: vi.fn().mockResolvedValue(undefined),
  resolveCheckoutApplicationFeeCents: vi.fn(),
  resolveLiveRoomIdForLiveRoomItem: vi.fn(),
  resolveLiveRoomIdForOrder: vi.fn(),
  ensureOrderPlatformFeeSnapshotPersisted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/payout/process-delivery-payout", () => ({
  initializeOrderPayoutOnPayment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/layaway", () => ({
  closeActiveLayawaysSupersededByMarketplacePurchaseTx: vi.fn().mockResolvedValue([]),
  refundSupersededLayawayPayments: vi.fn().mockResolvedValue(undefined),
}));

const orderRow = {
  id: "order_1",
  listingId: "listing_1",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  paymentStatus: "pending",
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
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  listing: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  layaway: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("finalizeStripeMarketplaceOrderPaid — parallel Stripe tax/breakdown fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue(orderRow);
  });

  it(
    "invokes both Stripe reads concurrently instead of one-after-another",
    async () => {
      let taxResolve!: (v: unknown) => void;
      let breakdownResolve!: (v: unknown) => void;
      fetchCheckoutSessionTax.mockReturnValue(new Promise((r) => (taxResolve = r)));
      fetchCheckoutSessionChargeBreakdown.mockReturnValue(new Promise((r) => (breakdownResolve = r)));

      // The first dynamic import of `@/services/payments` in a test file cold-loads a large
      // dependency graph and can exceed vitest's default 5s per-test timeout in slower
      // CI/sandbox environments — not a hang, just a slow cold import.
      const { finalizeStripeMarketplaceOrderPaid } = await import("@/services/payments");
      const pending = finalizeStripeMarketplaceOrderPaid("order_1", "pi_1", "cs_1");

      // Give the function a microtask tick to reach `await Promise.all(...)`.
      await Promise.resolve();

      // If this were still sequential (`await a(); await b();`), the breakdown fetch would not
      // have been called yet because the tax fetch's promise hasn't resolved.
      expect(fetchCheckoutSessionTax).toHaveBeenCalledWith("cs_1");
      expect(fetchCheckoutSessionChargeBreakdown).toHaveBeenCalledWith("cs_1");

      taxResolve({ taxAmountCents: 0, stripeTaxCalculationId: null });
      breakdownResolve({ taxUsd: 0, itemPriceUsd: 100, shippingPriceUsd: 5, totalUsd: 105 });

      await pending;
    },
    20_000,
  );
});
