import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: `recalculateAllSellerPayoutTiers` previously processed sellers one at a time in
// a fully sequential loop (performance audit 2026-07). This verifies the cron now runs sellers
// in bounded-concurrency batches (still deterministic pass/fail accounting) instead of either
// fully sequential or fully unbounded-parallel.

const hoisted = vi.hoisted(() => ({
  sellerIds: Array.from({ length: 12 }, (_, i) => `seller_${i}`),
  inFlight: 0,
  maxInFlight: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: vi.fn().mockResolvedValue(hoisted.sellerIds.map((sellerId) => ({ sellerId }))),
    },
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        createdAt: new Date("2024-01-01"),
      })),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("@/lib/payout-audit-log", () => ({
  logPayoutEligibilityDecision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/payout/seller-payout-tier", () => ({
  computeSellerPayoutMetrics: vi.fn().mockImplementation(async (sellerId: string) => {
    hoisted.inFlight += 1;
    hoisted.maxInFlight = Math.max(hoisted.maxInFlight, hoisted.inFlight);
    // Yield so overlapping calls within a batch are observable.
    await new Promise((r) => setTimeout(r, 5));
    hoisted.inFlight -= 1;
    if (sellerId === "seller_7") throw new Error("boom");
    return { lifetimeGmvUsd: 0 };
  }),
  evaluateSellerPayoutTier: vi.fn().mockReturnValue({
    effectiveTier: "standard",
    naturalTier: "standard",
    sellerLevel: "bronze",
    suspensionReasons: [],
  }),
  resolveInstantApprovalStatusAfterRecalc: vi.fn().mockReturnValue("not_eligible"),
  evaluateNaturalPayoutTier: vi.fn().mockReturnValue("standard"),
  syncLegacyInstantPayoutFields: vi.fn().mockReturnValue({}),
  upsertSellerPayoutMetrics: vi.fn().mockResolvedValue(undefined),
}));

describe("recalculateAllSellerPayoutTiers — bounded concurrency", () => {
  beforeEach(() => {
    hoisted.inFlight = 0;
    hoisted.maxInFlight = 0;
  });

  it("never runs more than the configured concurrency limit at once", async () => {
    const { recalculateAllSellerPayoutTiers } = await import("./recalculate-seller-payout-tier");
    const result = await recalculateAllSellerPayoutTiers();

    expect(hoisted.maxInFlight).toBeGreaterThan(1); // actually ran concurrently, not sequentially
    expect(hoisted.maxInFlight).toBeLessThanOrEqual(5);
    expect(result.candidates).toBe(12);
    expect(result.processed).toBe(11);
    expect(result.failed).toBe(1);
  });
});
