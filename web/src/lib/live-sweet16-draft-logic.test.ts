import { describe, expect, it } from "vitest";
import {
  SWEET16_MAX_SPOTS,
  SWEET16_PENDING_PAYMENT_MAX_AGE_MS,
  buildSweet16Board,
  combineSweet16SpotAbbr,
  combineSweet16SpotLabel,
  countBlockingPendingPayments,
  isLegacySweet16SlotBoard,
  resolveViewerPurchaseId,
  sweet16DraftPoolLabels,
  sweet16HasRoomFor,
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

describe("sweet16HasRoomFor", () => {
  it("allows sales up to the cap and no further", () => {
    expect(SWEET16_MAX_SPOTS).toBe(16);
    expect(sweet16HasRoomFor(0, 1)).toBe(true);
    expect(sweet16HasRoomFor(15, 1)).toBe(true);
    expect(sweet16HasRoomFor(16, 1)).toBe(false);
  });

  it("rejects a multi-team checkout that would cross the cap", () => {
    expect(sweet16HasRoomFor(14, 2)).toBe(true);
    expect(sweet16HasRoomFor(15, 2)).toBe(false);
  });
});

describe("isLegacySweet16SlotBoard", () => {
  it("recognizes the old blind slot boards but not team boards", () => {
    expect(isLegacySweet16SlotBoard(["Slot 1", "Slot 2", "slot 16"])).toBe(true);
    expect(isLegacySweet16SlotBoard(["Chiefs", "Bills"])).toBe(false);
    expect(isLegacySweet16SlotBoard(["Slot 1", "Chiefs"])).toBe(false);
    expect(isLegacySweet16SlotBoard([])).toBe(false);
  });
});

describe("sweet16DraftPoolLabels", () => {
  const variants = [
    { label: "Bills", abbr: "BUF", sortOrder: 1 },
    { label: "Chiefs", abbr: "KC", sortOrder: 0 },
    { label: "Jets", abbr: "NYJ", sortOrder: 2 },
  ];

  it("is every team nobody bought, in board order", () => {
    expect(sweet16DraftPoolLabels(variants, ["Bills"])).toEqual(["Chiefs", "Jets"]);
  });

  it("ignores case and spacing when matching bought teams", () => {
    expect(sweet16DraftPoolLabels(variants, [" chiefs "])).toEqual(["Bills", "Jets"]);
  });
});

describe("combineSweet16SpotLabel / Abbr", () => {
  it("shows both the bought and the drafted team", () => {
    expect(combineSweet16SpotLabel("Bills", "Chiefs")).toBe("Bills + Chiefs");
    expect(combineSweet16SpotAbbr("BUF", "KC")).toBe("BUF + KC");
  });

  it("falls back to just the drafted team when there is no bought team", () => {
    expect(combineSweet16SpotLabel(null, "Chiefs")).toBe("Chiefs");
    expect(combineSweet16SpotAbbr(" ", "KC")).toBe("KC");
  });
});

describe("buildSweet16Board", () => {
  const variants = [
    { label: "Chiefs", abbr: "KC", sortOrder: 0 },
    { label: "Bills", abbr: "BUF", sortOrder: 1 },
    { label: "Jets", abbr: "NYJ", sortOrder: 2 },
  ];

  it("marks each team open, purchased or drafted and keeps board order", () => {
    const board = buildSweet16Board(
      variants,
      [{ purchaseId: "p1", variantLabel: "Chiefs", buyerUsername: "amy" }],
      [{ teamLabel: "Bills", purchaseId: "p1", buyerUsername: "amy" }],
    );
    expect(board.map((t) => [t.label, t.state, t.buyerUsername])).toEqual([
      ["Chiefs", "purchased", "amy"],
      ["Bills", "drafted", "amy"],
      ["Jets", "open", null],
    ]);
  });
});
