import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/stripe-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-tax")>();
  return {
    ...actual,
    stripeLineItemProductData: vi.fn((name: string) => ({ name })),
    estimateSalesTaxCents,
    loadSellerShipFromForTax,
    fetchCheckoutSessionTax,
    recordStripeTaxTransaction,
    STRIPE_TAX_CODE_TANGIBLE: "tangible",
    TAX_PROVIDER_STRIPE: "stripe",
  };
});
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
}));

const prismaMock = vi.hoisted(() => ({
  layaway: {
    findFirst: vi.fn(),
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

import {
  completeLayawayPlan,
  createLayawayBalanceCheckout,
  createLayawayDepositCheckout,
  defaultLayawayPlan,
  finalizeLayawayDepositPaid,
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
      );
      expect(stripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: "pi_deposit", amount: 500 }),
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
    expect(call.payment_intent_data.transfer_data).toEqual({
      destination: "acct_seller",
      amount: 25_000 - 2000, // deposit − fee; tax stays with the platform
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
    expect(call.payment_intent_data.application_fee_amount).toBe(2000);
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
