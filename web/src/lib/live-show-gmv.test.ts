import { describe, expect, it } from "vitest";
import { liveShowEndGmvFields, liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";

describe("liveShowEndGmvFields", () => {
  it("zeroes the live-progress counter and snapshots the final total separately", () => {
    expect(liveShowEndGmvFields(3200)).toEqual({ completedSalesGmvUsd: 0, finalSalesGmvUsd: 3200 });
  });

  it("clamps a negative/invalid current GMV to 0", () => {
    expect(liveShowEndGmvFields(-50)).toEqual({ completedSalesGmvUsd: 0, finalSalesGmvUsd: 0 });
  });

  it("handles a show that ends with no completed sales", () => {
    expect(liveShowEndGmvFields(0)).toEqual({ completedSalesGmvUsd: 0, finalSalesGmvUsd: 0 });
  });
});

describe("liveShowGmvForFeeTierReconstruction", () => {
  it("returns null when there is no associated live show", () => {
    expect(liveShowGmvForFeeTierReconstruction(null)).toBeNull();
    expect(liveShowGmvForFeeTierReconstruction(undefined)).toBeNull();
  });

  it("uses the live in-progress counter while the show is still live", () => {
    const gmv = liveShowGmvForFeeTierReconstruction({
      status: "live",
      completedSalesGmvUsd: 1500,
      finalSalesGmvUsd: null,
    });
    expect(gmv).toBe(1500);
  });

  it("uses the persisted final snapshot once the show has ended, not the reset live counter", () => {
    const gmv = liveShowGmvForFeeTierReconstruction({
      status: "ended",
      completedSalesGmvUsd: 0,
      finalSalesGmvUsd: 3200,
    });
    expect(gmv).toBe(3200);
  });

  it("falls back to 0 for an ended show with no recorded final snapshot (e.g. pre-migration rows)", () => {
    const gmv = liveShowGmvForFeeTierReconstruction({
      status: "ended",
      completedSalesGmvUsd: 0,
      finalSalesGmvUsd: null,
    });
    expect(gmv).toBe(0);
  });

  it("treats a scheduled (not-yet-live) show the same as ended for this purpose", () => {
    const gmv = liveShowGmvForFeeTierReconstruction({
      status: "scheduled",
      completedSalesGmvUsd: 0,
      finalSalesGmvUsd: null,
    });
    expect(gmv).toBe(0);
  });
});
