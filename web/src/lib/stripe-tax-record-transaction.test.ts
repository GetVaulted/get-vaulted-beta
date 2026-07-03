import { beforeEach, describe, expect, it, vi } from "vitest";

const createFromCalculationMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "tax_txn_1" }));
const isStripeConfiguredMock = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ tax: { transactions: { createFromCalculation: createFromCalculationMock } } }),
  isStripeConfigured: isStripeConfiguredMock,
}));

import { recordStripeTaxTransaction } from "@/lib/stripe-tax";

describe("recordStripeTaxTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStripeConfiguredMock.mockReturnValue(true);
  });

  it("records a completed sale against Stripe Tax by calculation id + reference", async () => {
    await recordStripeTaxTransaction({ taxCalculationId: "taxcalc_1", reference: "ord_1" });

    expect(createFromCalculationMock).toHaveBeenCalledWith({
      calculation: "taxcalc_1",
      reference: "ord_1",
    });
  });

  it("is a no-op when there is no tax calculation id (e.g. no tax was collected)", async () => {
    await recordStripeTaxTransaction({ taxCalculationId: null, reference: "ord_1" });

    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("is a no-op when Stripe is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);

    await recordStripeTaxTransaction({ taxCalculationId: "taxcalc_1", reference: "ord_1" });

    expect(createFromCalculationMock).not.toHaveBeenCalled();
  });

  it("never throws — a failure here must not block payment finalization", async () => {
    createFromCalculationMock.mockRejectedValueOnce(new Error("stripe down"));

    await expect(
      recordStripeTaxTransaction({ taxCalculationId: "taxcalc_1", reference: "ord_1" }),
    ).resolves.toBeUndefined();
  });
});
