import { beforeEach, describe, expect, it, vi } from "vitest";

const calculationsCreateMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "taxcalc_monitor_1" }));
const createFromCalculationMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "tax_txn_monitor_1" }));
const isStripeConfiguredMock = vi.hoisted(() => vi.fn().mockReturnValue(true));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    tax: {
      calculations: { create: calculationsCreateMock },
      transactions: { createFromCalculation: createFromCalculationMock },
    },
  }),
  isStripeConfigured: isStripeConfiguredMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taxNexusState: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { recordTaxMonitoringOnlyTransaction } from "@/lib/stripe-tax";

const FL_SHIP_TO = {
  shipRecipientName: "Buyer",
  shipAddress: "123 Ocean Dr",
  shipCity: "Miami",
  shipState: "FL",
  shipZip: "33139",
  shipCountry: "US",
};

describe("recordTaxMonitoringOnlyTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStripeConfiguredMock.mockReturnValue(true);
  });

  it("records a $0-tax calculation + transaction for an unregistered state so Stripe can monitor it", async () => {
    await recordTaxMonitoringOnlyTransaction({
      orderId: "ord_fl_1",
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      shipTo: FL_SHIP_TO,
      alreadyHasCalculation: false,
    });

    expect(calculationsCreateMock).toHaveBeenCalledTimes(1);
    const [params, opts] = calculationsCreateMock.mock.calls[0];
    expect(params.customer_details.address.state).toBe("FL");
    expect(params.line_items[0].amount).toBe(5000);
    expect(params.shipping_cost.amount).toBe(500);
    expect(opts).toEqual({ idempotencyKey: "taxcalc_monitor_ord_fl_1" });

    expect(createFromCalculationMock).toHaveBeenCalledWith(
      { calculation: "taxcalc_monitor_1", reference: "ord_fl_1_monitor" },
      { idempotencyKey: "tax_txn_monitor_ord_fl_1" },
    );
  });

  it("skips entirely when a real (collected) calculation already exists for this order", async () => {
    await recordTaxMonitoringOnlyTransaction({
      orderId: "ord_tx_1",
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      shipTo: { ...FL_SHIP_TO, shipState: "TX" },
      alreadyHasCalculation: true,
    });

    expect(calculationsCreateMock).not.toHaveBeenCalled();
    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("skips non-US ship-to addresses", async () => {
    await recordTaxMonitoringOnlyTransaction({
      orderId: "ord_intl_1",
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      shipTo: { ...FL_SHIP_TO, shipState: "ON", shipCountry: "CA" },
      alreadyHasCalculation: false,
    });

    expect(calculationsCreateMock).not.toHaveBeenCalled();
  });

  it("skips a $0 order (nothing to monitor)", async () => {
    await recordTaxMonitoringOnlyTransaction({
      orderId: "ord_zero_1",
      itemPriceUsd: 0,
      shippingPriceUsd: 0,
      shipTo: FL_SHIP_TO,
      alreadyHasCalculation: false,
    });

    expect(calculationsCreateMock).not.toHaveBeenCalled();
  });

  it("never throws — a monitoring gap for one order must not block payment finalization", async () => {
    calculationsCreateMock.mockRejectedValueOnce(new Error("stripe down"));
    await expect(
      recordTaxMonitoringOnlyTransaction({
        orderId: "ord_fl_2",
        itemPriceUsd: 50,
        shippingPriceUsd: 5,
        shipTo: FL_SHIP_TO,
        alreadyHasCalculation: false,
      }),
    ).resolves.toBeUndefined();
    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("is a no-op when Stripe isn't configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    await recordTaxMonitoringOnlyTransaction({
      orderId: "ord_fl_3",
      itemPriceUsd: 50,
      shippingPriceUsd: 5,
      shipTo: FL_SHIP_TO,
      alreadyHasCalculation: false,
    });
    expect(calculationsCreateMock).not.toHaveBeenCalled();
  });
});
