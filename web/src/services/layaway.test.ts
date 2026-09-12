import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// createLayawayBalanceCheckout/createLayawayDepositCheckout build absolute return URLs via
// siteUrl() (web/src/services/layaway.ts), which requires NEXTAUTH_URL or NEXT_PUBLIC_SITE_URL.
// Stub it so these tests don't depend on an ambient `.env` (CI has none).
beforeAll(() => {
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({
  emitLayawayLifecycleSync: vi.fn(),
  emitOrderLifecycleSync: vi.fn(),
}));
vi.mock("@/lib/live-auction-inventory-hold", () => ({
  consumeListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
  releaseActiveInventoryHoldsForListingAndBuyerTx: vi.fn().mockResolvedValue(undefined),
  reserveListingInventoryHoldTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/marketplace/commerce-guards", () => ({
  assertLayawayStartAllowed: vi.fn(),
  CommerceGuardError: class CommerceGuardError extends Error {},
  loadListingCommerceContext: vi.fn().mockResolvedValue({}),
}));
const resolveCheckoutApplicationFeeCents = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock("@/lib/live-show-gmv", () => ({ resolveCheckoutApplicationFeeCents }));
vi.mock("@/services/payout/process-delivery-payout", () => ({
  initializeOrderPayoutOnPayment: vi.fn().mockResolvedValue(undefined),
}));
const resolveMarketplaceCheckoutShipping = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ shippingPriceUsd: 20, carrier: "usps", service: "priority" }),
);
vi.mock("@/services/marketplace-checkout-shipping", () => ({
  resolveMarketplaceCheckoutShipping,
}));
vi.mock("@/lib/stripe-payment-method-config", () => ({
  stripeCheckoutSessionPaymentOptions: vi.fn().mockReturnValue({}),
}));
const estimateSalesTaxCents = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ taxAmountCents: 0, taxCalculationId: null, collectTax: false }),
);
const loadSellerShipFromForTax = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const fetchCheckoutSessionTax = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ taxAmountCents: 0, taxUsd: 0, stripeTaxCalculationId: null, totalAmountCents: null }),
);
const recordStripeTaxTransaction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const reverseStripeTaxTransaction = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/lib/stripe-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-tax")>();
  return {
    ...actual,
    stripeLineItemProductData: vi.fn((name: string) => ({ name })),
    estimateSalesTaxCents,
    loadSellerShipFromForTax,
    fetchCheckoutSessionTax,
    recordStripeTaxTransaction,
    reverseStripeTaxTransaction,
    STRIPE_TAX_CODE_TANGIBLE: "tangible",
    TAX_PROVIDER_STRIPE: "stripe",
  };
});
vi.mock("@/lib/stripe-charge-ledger", () => ({
  persistOrderStripeChargeLedger: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/services/payments", () => ({
  PAYMENT_PAID: "paid",
  PAYMENT_PENDING: "pending_payment",
}));

const stripeRefundsCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "re_stub" }));
const stripeCheckoutSessionsCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "cs_stub", url: "https://checkout.test/cs_stub" }),
);
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    refunds: { create: stripeRefundsCreate },
    checkout: { sessions: { create: stripeCheckoutSessionsCreate } },
  }),
  isStripeConfigured: () => true,
}));

const prismaMock = vi.hoisted(() => ({
  layaway: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  layawayPayment: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "paymentrow_1" }),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  listing: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  order: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  layawayAuditLog: {
    create: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { createNotification } from "@/lib/notifications";
import {
  completeLayawayPlan,
  createLayawayBalanceCheckout,
  createLayawayDepositCheckout,
  defaultLayawayPlan,
  finalizeLayawayDepositPaid,
  processLayawayMaintenance,
  refundSupersededLayawayPayments,
} from "@/services/layaway";

describe("completeLayawayPlan copies the final payment's PaymentIntent onto the Order", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseLayawayRow = {
    id: "lay_1",
    orderId: "ord_1",
    listingId: "lst_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    originalPriceUsd: 100,
    shippingPriceUsd: 10,
    amountPaidUsd: 100,
    order: { stripePaymentIntentId: null },
    listing: { title: "Test item" },
  };

  it("sets Order.stripePaymentIntentId to the most recently paid installment's PI", async () => {
    prismaMock.layaway.findUnique.mockResolvedValue(baseLayawayRow);
    prismaMock.layawayPayment.findFirst.mockResolvedValue({ stripePaymentIntentId: "pi_final" });

    await completeLayawayPlan("lay_1");

    expect(prismaMock.layawayPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { layawayId: "lay_1", status: "paid", stripePaymentIntentId: { not: null } },
        orderBy: { paidAt: "desc" },
      }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1" },
        data: expect.objectContaining({ stripePaymentIntentId: "pi_final" }),
      }),
    );
  });

  it("falls back to any PI already on the order if no paid installment row is found", async () => {
    prismaMock.layaway.findUnique.mockResolvedValue({
      ...baseLayawayRow,
      order: { stripePaymentIntentId: "pi_preexisting" },
    });
    prismaMock.layawayPayment.findFirst.mockResolvedValue(null);

    await completeLayawayPlan("lay_1");

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripePaymentIntentId: "pi_preexisting" }),
      }),
    );
  });

  it("folds the tax already collected with the deposit back into totalUsd on completion", async () => {
    prismaMock.layaway.findUnique.mockResolvedValue({
      ...baseLayawayRow,
      order: { stripePaymentIntentId: "pi_deposit", taxUsd: 8.25 },
    });
    prismaMock.layawayPayment.findFirst.mockResolvedValue(null);

    await completeLayawayPlan("lay_1");

    // originalPriceUsd (100) + shippingPriceUsd (10) + taxUsd (8.25), matching a normal taxable sale.
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalUsd: 118.25 }) }),
    );
  });
});

describe("refundSupersededLayawayPayments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refunds every paid installment in full with reverse_transfer: true", async () => {
    prismaMock.layawayPayment.findMany.mockResolvedValue([
      { id: "pay_1", stripePaymentIntentId: "pi_1", amountUsd: 25 },
      { id: "pay_2", stripePaymentIntentId: "pi_2", amountUsd: 30 },
    ]);

    await refundSupersededLayawayPayments("lay_1");

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(2);
    for (const call of stripeRefundsCreate.mock.calls) {
      expect(call[0].reverse_transfer).toBe(true);
      // Full refund of the payment: no `amount` cap passed, so Stripe refunds the entire charge.
      expect(call[0].amount).toBeUndefined();
    }
    expect(prismaMock.layawayAuditLog.create).toHaveBeenCalled();
    // Each installment gets its own idempotency key so a retry can't double-refund one payment
    // or skip another.
    expect(stripeRefundsCreate.mock.calls[0][1]?.idempotencyKey).toBe("layaway_superseded_refund_pay_1");
    expect(stripeRefundsCreate.mock.calls[1][1]?.idempotencyKey).toBe("layaway_superseded_refund_pay_2");
  });

  it("is a no-op when there are no paid installments", async () => {
    prismaMock.layawayPayment.findMany.mockResolvedValue([]);

    await refundSupersededLayawayPayments("lay_2");

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(prismaMock.layawayAuditLog.create).not.toHaveBeenCalled();
  });

  it("continues refunding remaining payments even if one Stripe call fails", async () => {
    prismaMock.layawayPayment.findMany.mockResolvedValue([
      { id: "pay_1", stripePaymentIntentId: "pi_1", amountUsd: 25 },
      { id: "pay_2", stripePaymentIntentId: "pi_2", amountUsd: 30 },
    ]);
    stripeRefundsCreate.mockRejectedValueOnce(new Error("stripe down")).mockResolvedValueOnce({ id: "re_2" });

    await expect(refundSupersededLayawayPayments("lay_3")).resolves.toBeUndefined();

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(2);
  });
});

describe("defaultLayawayPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseLayaway = {
    id: "lay_1",
    listingId: "lst_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    orderId: "ord_1",
    amountPaidUsd: 40,
    depositAmountUsd: 25,
    listing: { title: "Test item" },
    order: {},
  };

  it("atomically claims the layaway via updateMany guarded on status: active", async () => {
    prismaMock.layaway.findFirst.mockResolvedValue(baseLayaway);
    prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.layawayPayment.findMany.mockResolvedValue([]);

    await defaultLayawayPlan("lay_1");

    expect(prismaMock.layaway.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lay_1", status: "active" },
        data: expect.objectContaining({ status: "defaulted" }),
      }),
    );
  });

  it("no-ops when a concurrent caller already claimed the default (race guard)", async () => {
    prismaMock.layaway.findFirst.mockResolvedValue(baseLayaway);
    prismaMock.layaway.updateMany.mockResolvedValue({ count: 0 });

    await defaultLayawayPlan("lay_1");

    // Claim lost the race: no listing/order mutation and no refund should be attempted.
    expect(prismaMock.listing.update).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("refunds the amount paid above the forfeited deposit with reverse_transfer: true", async () => {
    prismaMock.layaway.findFirst.mockResolvedValue(baseLayaway);
    prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.layawayPayment.findMany.mockResolvedValue([
      { id: "pay_1", stripePaymentIntentId: "pi_1", amountUsd: 15, paidAt: new Date() },
    ]);

    await defaultLayawayPlan("lay_1");

    // amountPaidUsd (40) - depositAmountUsd (25) = 15 refundable.
    expect(stripeRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, reverse_transfer: true }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("does not attempt a Stripe refund when nothing is refundable above the deposit", async () => {
    prismaMock.layaway.findFirst.mockResolvedValue({ ...baseLayaway, amountPaidUsd: 25 });
    prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });

    await defaultLayawayPlan("lay_1");

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  describe("tax refund on default", () => {
    it("refunds the tax collected with the deposit separately, without reverse_transfer", async () => {
      prismaMock.layaway.findFirst.mockResolvedValue({
        ...baseLayaway,
        amountPaidUsd: 25, // nothing paid above the deposit — only tax should be refunded
        order: { taxAmountCents: 825, taxRefundedCents: 0 },
      });
      prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.layawayPayment.findFirst.mockResolvedValue({
        id: "pay_deposit",
        stripePaymentIntentId: "pi_deposit",
      });

      await defaultLayawayPlan("lay_1");

      expect(prismaMock.layawayPayment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ layawayId: "lay_1", kind: "deposit", status: "paid" }),
        }),
      );
      expect(stripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: "pi_deposit", amount: 825 }),
        expect.objectContaining({ idempotencyKey: "layaway_default_tax_refund_pay_deposit_825c" }),
      );
      const taxRefundCall = stripeRefundsCreate.mock.calls.find((c) => c[0].payment_intent === "pi_deposit");
      // Tax was never transferred to the seller (explicit transfer_data.amount excluded it at
      // checkout) — reversing a transfer here would incorrectly claw back seller earnings.
      expect(taxRefundCall?.[0].reverse_transfer).toBeUndefined();
      expect(prismaMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ord_1" },
          data: expect.objectContaining({ taxRefundedCents: { increment: 825 } }),
        }),
      );
    });

    it("refunds tax and the amount above deposit as two separate, independent refunds", async () => {
      prismaMock.layaway.findFirst.mockResolvedValue({
        ...baseLayaway,
        amountPaidUsd: 40, // 15 above the 25 deposit
        order: { taxAmountCents: 500, taxRefundedCents: 0 },
      });
      prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.layawayPayment.findMany.mockResolvedValue([
        { id: "pay_1", stripePaymentIntentId: "pi_installment", amountUsd: 15, paidAt: new Date() },
      ]);
      prismaMock.layawayPayment.findFirst.mockResolvedValue({
        id: "pay_deposit",
        stripePaymentIntentId: "pi_deposit",
      });

      await defaultLayawayPlan("lay_1");

      expect(stripeRefundsCreate).toHaveBeenCalledTimes(2);
      expect(stripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: "pi_installment", amount: 1500, reverse_transfer: true }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
      expect(stripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: "pi_deposit", amount: 500 }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it("skips the tax refund entirely when no tax was ever collected", async () => {
      prismaMock.layaway.findFirst.mockResolvedValue({
        ...baseLayaway,
        amountPaidUsd: 25,
        order: { taxAmountCents: 0, taxRefundedCents: 0 },
      });
      prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });

      await defaultLayawayPlan("lay_1");

      expect(stripeRefundsCreate).not.toHaveBeenCalled();
      expect(prismaMock.layawayPayment.findFirst).not.toHaveBeenCalled();
    });

    it("does not double-refund tax that was already reversed", async () => {
      prismaMock.layaway.findFirst.mockResolvedValue({
        ...baseLayaway,
        amountPaidUsd: 25,
        order: { taxAmountCents: 825, taxRefundedCents: 825 },
      });
      prismaMock.layaway.updateMany.mockResolvedValue({ count: 1 });

      await defaultLayawayPlan("lay_1");

      expect(stripeRefundsCreate).not.toHaveBeenCalled();
    });
  });
});

describe("createLayawayBalanceCheckout fee base excludes shipping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes the platform fee on the item portion of the payment only, never on shipping", async () => {
    // remainingBalanceUsd (80) = 75% of item price (60) + 100% of shipping (20).
    prismaMock.layaway.findFirst.mockResolvedValue({
      id: "lay_1",
      buyerId: "buyer_1",
      orderId: "ord_1",
      remainingBalanceUsd: 80,
      shippingPriceUsd: 20,
      amountPaidUsd: 25,
      depositAmountUsd: 25,
      listing: { title: "Test item", isCompanyListing: false, seller: { stripeAccountId: "acct_1" } },
      order: { id: "ord_1", paymentStatus: "layaway_active" },
    });

    await createLayawayBalanceCheckout({ layawayId: "lay_1", buyerId: "buyer_1" });

    expect(resolveCheckoutApplicationFeeCents).toHaveBeenCalledWith(
      expect.objectContaining({ saleAmountUsd: 60 }),
    );
    // The buyer is still charged the full remaining balance (item + shipping) even though the
    // platform fee itself is only assessed against the item portion.
    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 8000 }) })],
      }),
    );
  });

  it("caps the fee base at whatever item balance remains when paying less than the full balance", async () => {
    // Only $40 of the $60 remaining item balance is being paid this time (shipping untouched yet).
    prismaMock.layaway.findFirst.mockResolvedValue({
      id: "lay_2",
      buyerId: "buyer_1",
      orderId: "ord_2",
      remainingBalanceUsd: 80,
      shippingPriceUsd: 20,
      amountPaidUsd: 25,
      depositAmountUsd: 25,
      listing: { title: "Test item", isCompanyListing: false, seller: { stripeAccountId: "acct_1" } },
      order: { id: "ord_2", paymentStatus: "layaway_active" },
    });

    await createLayawayBalanceCheckout({ layawayId: "lay_2", buyerId: "buyer_1", amountUsd: 40 });

    expect(resolveCheckoutApplicationFeeCents).toHaveBeenCalledWith(
      expect.objectContaining({ saleAmountUsd: 40 }),
    );
  });
});

describe("createLayawayDepositCheckout — sales tax collected once with the deposit", () => {
  beforeEach(() => vi.clearAllMocks());

  const listingRow = {
    id: "lst_1",
    title: "Vintage Widget",
    sellerId: "seller_1",
    status: "active",
    buyingFormat: "buy_now",
    priceUsd: 1000,
    shippingPriceUsd: 20,
    allowLayaway: true,
    moderationRemovedAt: null,
    shipFromAddressId: "addr_1",
    isCompanyListing: false,
    seller: { stripeAccountId: "acct_seller", stripeOnboardingComplete: true },
  };

  function setUpHappyPath() {
    prismaMock.layaway.count.mockResolvedValue(0);
    prismaMock.listing.findUnique.mockResolvedValue(listingRow);
    prismaMock.layaway.findFirst.mockResolvedValue(null);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue({ id: "ord_1" });
    prismaMock.layaway.create.mockResolvedValue({ id: "lay_1" });
    resolveCheckoutApplicationFeeCents.mockResolvedValue(20_00 * 0.08); // 8% of the $250 deposit
  }

  const shipping = {
    shipRecipientName: "Buyer One",
    shipAddress: "1 Main St",
    shipCity: "Austin",
    shipState: "TX",
    shipZip: "78701",
    shipCountry: "US",
  };

  it("adds a separate Sales tax line item sized on the FULL item + shipping, not just the deposit", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 8415, taxCalculationId: "taxcalc_1", collectTax: true });

    await createLayawayDepositCheckout({
      buyerId: "buyer_1",
      listingId: "lst_1",
      planType: "thirty_day",
      termsAcknowledged: true,
      shipping,
    });

    expect(estimateSalesTaxCents).toHaveBeenCalledWith(
      expect.objectContaining({ itemPriceUsd: 1000, shippingPriceUsd: 20 }),
    );
    const call = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(2);
    expect(call.line_items[0].price_data.unit_amount).toBe(25_000); // 25% deposit of $1000
    expect(call.line_items[1].price_data).toEqual(
      expect.objectContaining({ unit_amount: 8415, product_data: expect.objectContaining({ name: "Sales tax" }) }),
    );
  });

  it("does not fold tax into the deposit line item or Layaway.depositAmountUsd", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 8415, taxCalculationId: "taxcalc_1", collectTax: true });

    await createLayawayDepositCheckout({
      buyerId: "buyer_1",
      listingId: "lst_1",
      planType: "thirty_day",
      termsAcknowledged: true,
      shipping,
    });

    expect(prismaMock.layaway.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ depositAmountUsd: 250 }) }),
    );
  });

  it("uses an explicit seller transfer (deposit minus fee) so the platform — not the seller — keeps the tax", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 8415, taxCalculationId: "taxcalc_1", collectTax: true });
    resolveCheckoutApplicationFeeCents.mockResolvedValue(2000); // $20 fee on the $250 deposit

    await createLayawayDepositCheckout({
      buyerId: "buyer_1",
      listingId: "lst_1",
      planType: "thirty_day",
      termsAcknowledged: true,
      shipping,
    });

    const call = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(call.payment_intent_data.application_fee_amount).toBeUndefined();
    // Seller transfer = deposit − platform fee − Stripe processing (2.9% + $0.30 on deposit + tax).
    // Buyer charge = 25000 + 8415 = 33415¢ → processing = round(33415*0.029 + 30) = 999¢.
    expect(call.payment_intent_data.transfer_data).toEqual({
      destination: "acct_seller",
      amount: 25_000 - 2000 - 999,
    });
  });

  it("passes the tax amount and calculation id through session metadata for finalize-time read-back", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 8415, taxCalculationId: "taxcalc_1", collectTax: true });

    await createLayawayDepositCheckout({
      buyerId: "buyer_1",
      listingId: "lst_1",
      planType: "thirty_day",
      termsAcknowledged: true,
      shipping,
    });

    const call = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(call.metadata.salesTaxCents).toBe("8415");
    expect(call.metadata.stripeTaxCalculationId).toBe("taxcalc_1");
  });

  it("falls back to the plain fee-only transfer and skips the tax line item when no tax is due", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 0, taxCalculationId: null, collectTax: false });
    resolveCheckoutApplicationFeeCents.mockResolvedValue(2000);

    await createLayawayDepositCheckout({
      buyerId: "buyer_1",
      listingId: "lst_1",
      planType: "thirty_day",
      termsAcknowledged: true,
      shipping,
    });

    const call = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(1);
    // No tax: application fee = platform fee + Stripe processing on the deposit.
    // processing = round(25000*0.029 + 30) = 755¢ → 2000 + 755 = 2755.
    expect(call.payment_intent_data.application_fee_amount).toBe(2755);
    expect(call.payment_intent_data.transfer_data).toEqual({ destination: "acct_seller" });
    expect(call.metadata.salesTaxCents).toBeUndefined();
  });

  it("proceeds without tax if the Stripe Tax calculation fails", async () => {
    setUpHappyPath();
    estimateSalesTaxCents.mockRejectedValue(new Error("stripe tax down"));

    await expect(
      createLayawayDepositCheckout({
        buyerId: "buyer_1",
        listingId: "lst_1",
        planType: "thirty_day",
        termsAcknowledged: true,
        shipping,
      }),
    ).resolves.toEqual(expect.objectContaining({ layawayId: "lay_1" }));

    const call = stripeCheckoutSessionsCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(1);
  });
});

describe("createLayawayDepositCheckout — rolls back when Stripe session creation fails", () => {
  beforeEach(() => vi.clearAllMocks());

  const listingRow = {
    id: "lst_1",
    title: "Vintage Widget",
    sellerId: "seller_1",
    status: "active",
    buyingFormat: "buy_now",
    priceUsd: 1000,
    shippingPriceUsd: 20,
    allowLayaway: true,
    moderationRemovedAt: null,
    shipFromAddressId: "addr_1",
    isCompanyListing: false,
    seller: { stripeAccountId: "acct_seller", stripeOnboardingComplete: true },
  };

  const shipping = {
    shipRecipientName: "Buyer One",
    shipAddress: "1 Main St",
    shipCity: "Austin",
    shipState: "TX",
    shipZip: "78701",
    shipCountry: "US",
  };

  it("reverts the listing, order, and layaway instead of stranding a layaway_reserved listing forever", async () => {
    prismaMock.layaway.count.mockResolvedValue(0);
    prismaMock.listing.findUnique.mockResolvedValue(listingRow);
    prismaMock.layaway.findFirst.mockResolvedValue(null);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue({ id: "ord_1" });
    prismaMock.layaway.create.mockResolvedValue({ id: "lay_1" });
    resolveCheckoutApplicationFeeCents.mockResolvedValue(0);
    estimateSalesTaxCents.mockResolvedValue({ taxAmountCents: 0, taxCalculationId: null, collectTax: false });

    // Rollback (`cancelAbandonedLayawayCheckout`) looks the layaway back up outside the original
    // transaction — provide the shape it needs to decide the order/listing aren't already paid.
    prismaMock.layaway.findUnique.mockResolvedValue({
      id: "lay_1",
      status: "active",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      orderId: "ord_1",
      listing: { id: "lst_1", status: "layaway_reserved", allowOffers: true, acceptTradeOffers: false },
      order: { id: "ord_1", paymentStatus: "pending_payment", paymentMethod: "layaway" },
    });

    stripeCheckoutSessionsCreate.mockRejectedValueOnce(new Error("Stripe API unreachable"));

    await expect(
      createLayawayDepositCheckout({
        buyerId: "buyer_1",
        listingId: "lst_1",
        planType: "thirty_day",
        termsAcknowledged: true,
        shipping,
      }),
    ).rejects.toThrow("Stripe API unreachable");

    // Layaway flipped out of `active` so it can never be paid/defaulted after the fact.
    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remainingBalanceUsd: 0 }) }),
    );
    // Order cancelled rather than left `pending` forever with no live Stripe session behind it.
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "cancelled" }) }),
    );
    // Listing released back to `active` so another buyer can purchase it.
    expect(prismaMock.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lst_1" }, data: { status: "active" } }),
    );
  });
});

describe("finalizeLayawayDepositPaid persists tax onto the Order", () => {
  beforeEach(() => vi.clearAllMocks());

  const layRow = {
    id: "lay_1",
    orderId: "ord_1",
    listingId: "lst_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    depositAmountUsd: 250,
    amountPaidUsd: 0,
    remainingBalanceUsd: 830,
    originalPriceUsd: 1000,
    shippingPriceUsd: 20,
    listing: { id: "lst_1", title: "Test item", status: "layaway_reserved" },
    order: { shipState: "TX" },
  };

  it("persists taxAmountCents/taxUsd/totalUsd read back from the completed Checkout Session", async () => {
    prismaMock.layaway.findUnique
      .mockResolvedValueOnce({ amountPaidUsd: 0, depositAmountUsd: 250 }) // precheck
      .mockResolvedValueOnce(layRow) // inside the transaction
      .mockResolvedValueOnce({
        id: "lay_1",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        orderId: "ord_1",
        listing: { title: "Test item" },
        depositAmountUsd: 250,
        dueAt: new Date(),
      }); // post-transaction notification fetch
    fetchCheckoutSessionTax.mockResolvedValue({
      taxAmountCents: 8415,
      taxUsd: 84.15,
      stripeTaxCalculationId: "taxcalc_1",
      totalAmountCents: 33_415,
    });

    await finalizeLayawayDepositPaid({
      layawayId: "lay_1",
      orderId: "ord_1",
      paymentIntentId: "pi_deposit",
      checkoutSessionId: "cs_1",
    });

    expect(fetchCheckoutSessionTax).toHaveBeenCalledWith("cs_1");
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1" },
        data: expect.objectContaining({
          taxAmountCents: 8415,
          taxUsd: 84.15,
          stripeTaxCalculationId: "taxcalc_1",
          // item (1000) + shipping (20) + tax (84.15) — reconciles like a normal taxable sale.
          totalUsd: 1104.15,
        }),
      }),
    );
    expect(recordStripeTaxTransaction).toHaveBeenCalledWith({
      taxCalculationId: "taxcalc_1",
      reference: "ord_1",
      persistToOrderId: "ord_1",
    });
  });

  it("persists zero tax cleanly when the session had no tax (e.g. no nexus)", async () => {
    prismaMock.layaway.findUnique
      .mockResolvedValueOnce({ amountPaidUsd: 0, depositAmountUsd: 250 }) // precheck
      .mockResolvedValueOnce(layRow) // inside the transaction
      .mockResolvedValueOnce({
        id: "lay_1",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        orderId: "ord_1",
        listing: { title: "Test item" },
        depositAmountUsd: 250,
        dueAt: new Date(),
      }); // post-transaction notification fetch
    fetchCheckoutSessionTax.mockResolvedValue(null);

    await finalizeLayawayDepositPaid({
      layawayId: "lay_1",
      orderId: "ord_1",
      paymentIntentId: "pi_deposit",
      checkoutSessionId: "cs_1",
    });

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taxAmountCents: 0, taxUsd: 0, totalUsd: 1020 }),
      }),
    );
  });

  it("is idempotent — a redelivered webhook after the deposit is already recorded is a no-op, and skips the Stripe tax lookup entirely", async () => {
    prismaMock.layaway.findUnique.mockResolvedValueOnce({ amountPaidUsd: 250, depositAmountUsd: 250 });

    await finalizeLayawayDepositPaid({
      layawayId: "lay_1",
      orderId: "ord_1",
      paymentIntentId: "pi_deposit",
      checkoutSessionId: "cs_1",
    });

    expect(fetchCheckoutSessionTax).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});

// Regression (chaos audit): reminders used exact-day-match (`d === elapsedDays`), so a single
// skipped cron run permanently skipped that reminder — it could never fire again since
// `elapsedDays` only ever increases. `processLayawayMaintenance` now catches up on the latest
// applicable reminder instead.
describe("processLayawayMaintenance — reminder catch-up after a skipped cron run", () => {
  beforeEach(() => vi.clearAllMocks());

  function activeLayawayAt(elapsedDays: number, lastReminderDay: number | null) {
    return {
      id: "lay_1",
      buyerId: "buyer_1",
      planType: "thirty_day",
      startedAt: new Date(Date.now() - elapsedDays * 24 * 60 * 60 * 1000),
      lastReminderDay,
      listing: { title: "Vintage Card" },
      remainingBalanceUsd: 750,
      dueAt: new Date(Date.now() + (30 - elapsedDays) * 24 * 60 * 60 * 1000),
    };
  }

  it("sends the day-21 reminder exactly on day 21 (baseline, no regression)", async () => {
    prismaMock.layaway.findMany
      .mockResolvedValueOnce([]) // overdue
      .mockResolvedValueOnce([activeLayawayAt(21, 7)]); // active

    await processLayawayMaintenance();

    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ type: "layaway_reminder" }),
    );
    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lay_1" }, data: { lastReminderDay: 21 } }),
    );
  });

  it("catches up on the day-21 reminder even if the cron only runs again on day 25", async () => {
    prismaMock.layaway.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([activeLayawayAt(25, 7)]);

    await processLayawayMaintenance();

    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ type: "layaway_reminder" }),
    );
    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastReminderDay: 21 } }),
    );
  });

  it("sends only the single latest applicable reminder when multiple were missed at once, not one per missed day", async () => {
    prismaMock.layaway.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([activeLayawayAt(29, 0)]);

    await processLayawayMaintenance();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastReminderDay: 27 } }),
    );
  });

  it("catches up on the final warning even after the exact due day is missed", async () => {
    prismaMock.layaway.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([activeLayawayAt(35, 27)]);

    await processLayawayMaintenance();

    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ type: "layaway_final_warning" }),
    );
    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastReminderDay: 30 } }),
    );
  });

  it("does not resend a reminder that has already been recorded", async () => {
    prismaMock.layaway.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([activeLayawayAt(21, 21)]);

    await processLayawayMaintenance();

    expect(createNotification).not.toHaveBeenCalled();
    expect(prismaMock.layaway.update).not.toHaveBeenCalled();
  });
});
