import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_PENDING } from "@/services/payments";

vi.mock("@/services/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payments")>();
  return {
    ...actual,
    processAuctionPaymentExpiries: vi.fn().mockResolvedValue(undefined),
    finalizeStripeMarketplaceOrderPaid: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: vi.fn().mockReturnValue(true),
  getStripe: vi.fn(),
}));

vi.mock("@/lib/stripe-customer", () => ({
  assertPaymentMethodOwnedByUser: vi.fn().mockResolvedValue(undefined),
  getBuyerDefaultCardPaymentMethodId: vi.fn(),
}));

vi.mock("@/lib/stripe-tax", () => ({
  orderRequiresCheckoutForTax: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { orderRequiresCheckoutForTax } from "@/lib/stripe-tax";
import { chargeMarketplaceOrderWithSavedPaymentMethod } from "@/lib/stripe-charge-order-saved-pm";

describe("chargeMarketplaceOrderWithSavedPaymentMethod tax gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orderRequiresCheckoutForTax).mockResolvedValue(false);
  });

  it("blocks saved-card charge when checkout is required for tax", async () => {
    vi.mocked(orderRequiresCheckoutForTax).mockResolvedValue(true);

    prismaMock.order.findFirst.mockResolvedValue({
      id: "ord_tax",
      buyerId: "buyer_1",
      paymentStatus: PAYMENT_PENDING,
      paymentMethod: "stripe",
      paymentDeadlineAt: new Date(Date.now() + 60_000),
      paymentLabel: "pm_123456789012345678901234",
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      taxUsd: 0,
      shipState: "TX",
      shipCountry: "US",
      listingId: "lst_1",
      listing: { id: "lst_1", buyingFormat: "auction", status: "awaiting_auction_payment", isCompanyListing: false },
      seller: { stripeAccountId: "acct_1", stripeOnboardingComplete: true },
      liveShippingSession: null,
    });

    const result = await chargeMarketplaceOrderWithSavedPaymentMethod({
      buyerId: "buyer_1",
      orderId: "ord_tax",
    });

    expect(result).toEqual({ outcome: "error", code: "REQUIRES_CHECKOUT_FOR_TAX" });
    expect(orderRequiresCheckoutForTax).toHaveBeenCalledWith("TX", "US");
  });
});
