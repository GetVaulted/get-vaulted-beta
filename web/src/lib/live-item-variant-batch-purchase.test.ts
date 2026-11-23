import { describe, expect, it } from "vitest";
import {
  formatVariantBatchCelebrationLabel,
  formatVariantBatchOrderTitle,
  LIVE_VARIANT_BATCH_MAX_SPOTS,
  partitionBatchPurchaseRows,
} from "@/lib/live-item-variant-batch-purchase";

describe("partitionBatchPurchaseRows", () => {
  it("separates paid, pending and failed rows (the eroc32 Cardinals/Raiders shape)", () => {
    const rows = [
      { id: "cardinals", paymentStatus: "paid" },
      { id: "raiders", paymentStatus: "failed" },
      { id: "chiefs", paymentStatus: "pending_payment" },
    ];
    const { paid, pending, failed } = partitionBatchPurchaseRows(rows);
    expect(paid.map((r) => r.id)).toEqual(["cardinals"]);
    expect(pending.map((r) => r.id)).toEqual(["chiefs"]);
    expect(failed.map((r) => r.id)).toEqual(["raiders"]);
  });

  it("handles an empty batch", () => {
    expect(partitionBatchPurchaseRows([])).toEqual({ paid: [], pending: [], failed: [] });
  });
});

describe("live-item-variant-batch-purchase helpers", () => {
  it("caps batch size at 32", () => {
    expect(LIVE_VARIANT_BATCH_MAX_SPOTS).toBe(32);
  });

  it("formats order titles for one, two, and many labels", () => {
    expect(formatVariantBatchOrderTitle(["Bengals"])).toBe("Live spot: Bengals");
    expect(formatVariantBatchOrderTitle(["Bengals", "Chiefs"])).toBe("Live spots: Bengals, Chiefs");
    expect(formatVariantBatchOrderTitle(["Bengals", "Chiefs", "Bills", "Ravens"])).toBe(
      "Live spots: Bengals, Chiefs (+2)",
    );
  });

  it("formats celebration labels", () => {
    expect(formatVariantBatchCelebrationLabel(["Bengals", "Chiefs", "Bills"])).toBe(
      "Bengals · Chiefs · Bills",
    );
    expect(formatVariantBatchCelebrationLabel(["A", "B", "C", "D"])).toBe("A · B +2 more");
  });
});
