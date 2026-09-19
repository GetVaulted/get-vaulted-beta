import { describe, expect, it } from "vitest";
import {
  categorizeBalanceTransaction,
  expectedPlatformNetUsd,
  varianceUsd,
} from "@/lib/admin/stripe-balance-reconciliation";

describe("stripe-balance-reconciliation helpers", () => {
  it("categorizes Tax API Calculation/Transaction balance lines as tax_fee", () => {
    expect(
      categorizeBalanceTransaction({
        type: "stripe_fee",
        description: "Tax API Calculation",
      }),
    ).toBe("tax_fee");
    expect(
      categorizeBalanceTransaction({
        type: "stripe_fee",
        description: "Tax API Transaction",
      }),
    ).toBe("tax_fee");
  });

  it("categorizes application fee and transfer refund types", () => {
    expect(categorizeBalanceTransaction({ type: "application_fee" })).toBe("application_fee");
    expect(categorizeBalanceTransaction({ type: "application_fee_refund" })).toBe(
      "application_fee_refund",
    );
    expect(categorizeBalanceTransaction({ type: "transfer_refund" })).toBe("transfer_refund");
  });

  it("expected platform net keeps fee + tax and subtracts refunds/labels", () => {
    expect(
      expectedPlatformNetUsd({
        platformFeeUsd: 8,
        taxUsd: 8.25,
        taxRefundedUsd: 0,
        unrecoveredLabelCostUsd: 0,
      }),
    ).toBe(16.25);

    expect(
      expectedPlatformNetUsd({
        platformFeeUsd: 8,
        taxUsd: 8.25,
        taxRefundedUsd: 8.25,
        unrecoveredLabelCostUsd: 4,
        applicationFeeRefundedUsd: 0.74,
      }),
    ).toBe(3.26);
  });

  it("variance flags cents-level mismatches", () => {
    expect(varianceUsd(16.25, 16.25)).toBe(0);
    expect(varianceUsd(16.25, 16.12)).toBe(-0.13);
  });

  it("does not treat sales tax collected as a Tax API cost category for charges", () => {
    expect(categorizeBalanceTransaction({ type: "charge", description: "Payment for Order" })).toBe(
      "charge",
    );
  });
});
