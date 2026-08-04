import { describe, expect, it } from "vitest";
import { connectBulkPayoutCoversReadyQueue } from "@/lib/admin/reconcile-stripe-bank-payouts";

describe("connectBulkPayoutCoversReadyQueue", () => {
  it("matches GOMO-style emptied Connect with Dashboard bulk payouts", () => {
    expect(
      connectBulkPayoutCoversReadyQueue({
        availableUsdCents: 0,
        pendingUsdCents: 0,
        paidPayoutUsdCents: 54648 + 18644,
        estimatedReadyNetUsdCents: 71200,
      }),
    ).toBe(true);
  });

  it("does not clear queue while Connect still holds available funds", () => {
    expect(
      connectBulkPayoutCoversReadyQueue({
        availableUsdCents: 50_000,
        pendingUsdCents: 0,
        paidPayoutUsdCents: 73_000,
        estimatedReadyNetUsdCents: 71_200,
      }),
    ).toBe(false);
  });

  it("does not clear when payouts do not cover the ready net", () => {
    expect(
      connectBulkPayoutCoversReadyQueue({
        availableUsdCents: 0,
        pendingUsdCents: 0,
        paidPayoutUsdCents: 10_000,
        estimatedReadyNetUsdCents: 71_200,
      }),
    ).toBe(false);
  });
});
