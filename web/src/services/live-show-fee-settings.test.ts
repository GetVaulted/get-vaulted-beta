import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  platformLiveShowFeeConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  ensureLiveShowFeeCache,
  getCachedLiveShowFeeConfig,
  invalidateLiveShowFeeCache,
  setLiveShowFeeConfig,
} from "@/services/live-show-fee-settings";

describe("live show fee settings cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateLiveShowFeeCache();
  });

  it("falls back to code defaults only before the cache is warmed", () => {
    expect(getCachedLiveShowFeeConfig().tier1FeePercent).toBe(8);
    expect(getCachedLiveShowFeeConfig().tier2FeePercent).toBe(7.25);
  });

  it("keeps admin DB values on sync reads after warm, even past TTL", async () => {
    prismaMock.platformLiveShowFeeConfig.findUnique.mockResolvedValue({
      tier1FeePercent: 5,
      tier2ThresholdUsd: 500,
      tier2FeePercent: 4,
      tier3ThresholdUsd: 2000,
      tier3FeePercent: 3,
    });

    await ensureLiveShowFeeCache(true);
    expect(getCachedLiveShowFeeConfig().tier1FeePercent).toBe(5);
    expect(getCachedLiveShowFeeConfig().tier2FeePercent).toBe(4);

    // Simulate TTL expiry without wiping the warmed value.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    expect(getCachedLiveShowFeeConfig().tier1FeePercent).toBe(5);
  });

  it("merges admin patches against DB config, not cold code defaults", async () => {
    prismaMock.platformLiveShowFeeConfig.findUnique.mockResolvedValue({
      tier1FeePercent: 5,
      tier2ThresholdUsd: 500,
      tier2FeePercent: 4,
      tier3ThresholdUsd: 2000,
      tier3FeePercent: 3,
    });
    prismaMock.platformLiveShowFeeConfig.upsert.mockResolvedValue({});

    invalidateLiveShowFeeCache();
    const next = await setLiveShowFeeConfig({ tier1FeePercent: 4.5 }, "admin_1");

    expect(next.tier1FeePercent).toBe(4.5);
    expect(next.tier2FeePercent).toBe(4);
    expect(next.tier3FeePercent).toBe(3);
    expect(prismaMock.platformLiveShowFeeConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          tier1FeePercent: 4.5,
          tier2FeePercent: 4,
          tier3FeePercent: 3,
        }),
      }),
    );
  });
});
