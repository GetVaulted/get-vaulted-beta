import { describe, expect, it } from "vitest";
import {
  SWEET16_PENDING_PAYMENT_MAX_AGE_MS,
  countBlockingPendingPayments,
  resolveViewerPurchaseId,
} from "./live-sweet16-draft-logic";

describe("resolveViewerPurchaseId", () => {
  it("returns null when the viewer owns no slot", () => {
    expect(resolveViewerPurchaseId([], "p1")).toBeNull();
  });

  it("returns the only purchase for a single-slot buyer, whoever's turn it is", () => {
    expect(resolveViewerPurchaseId(["p1"], "p9")).toBe("p1");
    expect(resolveViewerPurchaseId(["p1"], null)).toBe("p1");
  });

  it("returns the purchase that is up now when a multi-slot buyer owns it", () => {
    expect(resolveViewerPurchaseId(["pA", "pB", "pC"], "pB")).toBe("pB");
    expect(resolveViewerPurchaseId(["pA", "pB", "pC"], "pC")).toBe("pC");
  });

  it("falls back to the first purchase when the current turn belongs to someone else", () => {
    expect(resolveViewerPurchaseId(["pA", "pB"], "other")).toBe("pA");
    expect(resolveViewerPurchaseId(["pA", "pB"], null)).toBe("pA");
  });
});

describe("countBlockingPendingPayments", () => {
  const now = 1_000_000_000;

  it("is zero when every slot is paid", () => {
    expect(countBlockingPendingPayments([{ paymentStatus: "paid", createdAtMs: now - 5000 }], now)).toBe(0);
  });

  it("counts a fresh pending checkout", () => {
    expect(
      countBlockingPendingPayments(
        [
          { paymentStatus: "paid", createdAtMs: now - 60_000 },
          { paymentStatus: "pending_payment", createdAtMs: now - 30_000 },
        ],
        now,
      ),
    ).toBe(1);
  });

  it("ignores abandoned pending checkouts past the max age", () => {
    expect(
      countBlockingPendingPayments(
        [{ paymentStatus: "pending_payment", createdAtMs: now - SWEET16_PENDING_PAYMENT_MAX_AGE_MS - 1 }],
        now,
      ),
    ).toBe(0);
  });

  it("ignores failed and cancelled purchases", () => {
    expect(
      countBlockingPendingPayments(
        [
          { paymentStatus: "failed", createdAtMs: now - 1000 },
          { paymentStatus: "cancelled", createdAtMs: now - 1000 },
        ],
        now,
      ),
    ).toBe(0);
  });
});
