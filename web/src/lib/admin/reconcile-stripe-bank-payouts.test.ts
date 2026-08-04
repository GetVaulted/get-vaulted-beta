import { describe, expect, it } from "vitest";
import {
  allocateOrdersAlreadyBankPaidByConnectShortfall,
  connectBulkPayoutCoversReadyQueue,
} from "@/lib/admin/reconcile-stripe-bank-payouts";

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

describe("allocateOrdersAlreadyBankPaidByConnectShortfall", () => {
  it("clears oldest ready orders when queue exceeds Connect available+pending", () => {
    const result = allocateOrdersAlreadyBankPaidByConnectShortfall({
      availableUsdCents: 2_000,
      pendingUsdCents: 8_000,
      slackUsdCents: 0,
      orders: [
        { id: "old-a", estimatedNetUsdCents: 30_000, sortAtMs: 1 },
        { id: "old-b", estimatedNetUsdCents: 20_000, sortAtMs: 2 },
        { id: "new-c", estimatedNetUsdCents: 10_000, sortAtMs: 3 },
      ],
    });
    // ready $600, on Connect $100 → shortfall $500 → mark old-a ($300) + old-b ($200)
    expect(result.markPaidIds).toEqual(["old-a", "old-b"]);
    expect(result.keepReadyIds).toEqual(["new-c"]);
  });

  it("clears AYEDUB-style mix: pending new funds keep newest ready, bank older shortfall", () => {
    const result = allocateOrdersAlreadyBankPaidByConnectShortfall({
      availableUsdCents: 0,
      pendingUsdCents: 15_000,
      slackUsdCents: 500,
      orders: [
        { id: "ayedub-old-1", estimatedNetUsdCents: 40_000, sortAtMs: 10 },
        { id: "ayedub-old-2", estimatedNetUsdCents: 35_000, sortAtMs: 20 },
        { id: "ayedub-new", estimatedNetUsdCents: 15_000, sortAtMs: 30 },
      ],
    });
    expect(result.markPaidIds).toEqual(["ayedub-old-1", "ayedub-old-2"]);
    expect(result.keepReadyIds).toEqual(["ayedub-new"]);
  });

  it("keeps entire queue when Connect still covers estimated net", () => {
    const result = allocateOrdersAlreadyBankPaidByConnectShortfall({
      availableUsdCents: 50_000,
      pendingUsdCents: 20_000,
      orders: [
        { id: "a", estimatedNetUsdCents: 30_000, sortAtMs: 1 },
        { id: "b", estimatedNetUsdCents: 25_000, sortAtMs: 2 },
      ],
    });
    expect(result.markPaidIds).toEqual([]);
    expect(result.keepReadyIds).toEqual(["a", "b"]);
  });
});
