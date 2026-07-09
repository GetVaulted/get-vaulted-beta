import { describe, expect, it } from "vitest";
import {
  ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS,
  ECONOMIC_NEXUS_TRANSACTION_THRESHOLD,
  effectiveOrderTaxAmountCents,
  resolveNexusWatchLevel,
} from "@/lib/sales-tax-reporting";

describe("sales-tax-reporting", () => {
  it("uses taxAmountCents when present", () => {
    expect(effectiveOrderTaxAmountCents({ taxAmountCents: 825, taxUsd: 0 })).toBe(825);
  });

  it("falls back to taxUsd for legacy orders", () => {
    expect(effectiveOrderTaxAmountCents({ taxAmountCents: 0, taxUsd: 8.25 })).toBe(825);
  });
});

describe("resolveNexusWatchLevel", () => {
  it("returns none for collecting states regardless of volume", () => {
    expect(
      resolveNexusWatchLevel({
        totalGmvCents: ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS + 1,
        orderCount: 500,
        collectionEnabled: true,
      }).level,
    ).toBe("none");
  });

  it("flags exceeded when sales cross the reference threshold", () => {
    const watch = resolveNexusWatchLevel({
      totalGmvCents: ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS,
      orderCount: 1,
      collectionEnabled: false,
    });
    expect(watch.level).toBe("exceeded");
    expect(watch.salesThresholdPercent).toBe(100);
  });

  it("flags exceeded when transactions cross the reference threshold", () => {
    const watch = resolveNexusWatchLevel({
      totalGmvCents: 0,
      orderCount: ECONOMIC_NEXUS_TRANSACTION_THRESHOLD,
      collectionEnabled: false,
    });
    expect(watch.level).toBe("exceeded");
    expect(watch.transactionThresholdPercent).toBe(100);
  });

  it("flags approaching when at least 75% of either threshold is reached", () => {
    const watch = resolveNexusWatchLevel({
      totalGmvCents: Math.round(ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS * 0.8),
      orderCount: 1,
      collectionEnabled: false,
    });
    expect(watch.level).toBe("approaching");
  });
});
