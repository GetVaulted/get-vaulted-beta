import { describe, expect, it } from "vitest";
import {
  SWEET16_URGENT_MS,
  Sweet16RequestError,
  draftPillState,
  draftProgress,
  formatDraftCountdown,
  isSweet16DraftItem,
  isSweet16TileSelectable,
  isViewerTurn,
  nextTurnPrompt,
  sweet16Board,
  sweet16BoardCounts,
  sweet16BoardFromItem,
  sweet16BuyerResults,
  sweet16ErrorMessage,
  sweet16OrderRows,
  sweet16SalesStatus,
  sweet16TileCaption,
  turnRemainingMs,
  viewerTurnKey,
  type Sweet16Draft,
} from "./sweet16-draft-client";
import type { LiveItemVariantDTO } from "./live-item-variant-serialize";

const NOW = Date.parse("2026-10-05T18:00:00.000Z");

function draft(patch: Partial<Sweet16Draft> = {}): Sweet16Draft {
  return {
    itemId: "item1",
    liveRoomId: "room1",
    status: "in_progress",
    turnOrder: ["p1", "p2", "p3", "p4"],
    order: [],
    board: [],
    maxSpots: 16,
    soldCount: 4,
    currentTurnIndex: 1,
    currentTurnPurchaseId: "p2",
    currentTurnBuyerUsername: "bob",
    currentTurnDeadlineAt: new Date(NOW + 42_000).toISOString(),
    remainingTeamLabels: ["Bills", "Jets"],
    turnSeconds: 60,
    startedAt: new Date(NOW - 90_000).toISOString(),
    completedAt: null,
    viewerPurchaseId: null,
    picks: [
      { purchaseId: "p1", turnIndex: 0, teamLabel: "Chiefs", teamAbbr: "KC", autoAssigned: false, buyerUsername: "amy" },
    ],
    ...patch,
  };
}

describe("formatDraftCountdown", () => {
  it("formats seconds with a zero-padded field", () => {
    expect(formatDraftCountdown(42_000)).toBe("0:42");
    expect(formatDraftCountdown(5_000)).toBe("0:05");
  });

  it("rounds up so an open turn never reads 0:00", () => {
    expect(formatDraftCountdown(41_001)).toBe("0:42");
    expect(formatDraftCountdown(1)).toBe("0:01");
  });

  it("clamps at zero and rolls over into minutes", () => {
    expect(formatDraftCountdown(0)).toBe("0:00");
    expect(formatDraftCountdown(-5000)).toBe("0:00");
    expect(formatDraftCountdown(61_000)).toBe("1:01");
  });
});

describe("turnRemainingMs", () => {
  it("is the time to the deadline while a turn is running", () => {
    expect(turnRemainingMs(draft(), NOW)).toBe(42_000);
  });

  it("is null when there is no running turn", () => {
    expect(turnRemainingMs(null, NOW)).toBeNull();
    expect(turnRemainingMs(draft({ status: "complete", currentTurnDeadlineAt: null }), NOW)).toBeNull();
    expect(turnRemainingMs(draft({ status: "not_started" }), NOW)).toBeNull();
  });

  it("is null for an unparseable deadline", () => {
    expect(turnRemainingMs(draft({ currentTurnDeadlineAt: "nope" }), NOW)).toBeNull();
  });
});

describe("isViewerTurn / viewerTurnKey", () => {
  it("is true only when the viewer owns the purchase that is up", () => {
    expect(isViewerTurn(draft({ viewerPurchaseId: "p2" }))).toBe(true);
    expect(isViewerTurn(draft({ viewerPurchaseId: "p3" }))).toBe(false);
    expect(isViewerTurn(draft({ viewerPurchaseId: null }))).toBe(false);
    expect(isViewerTurn(null)).toBe(false);
  });

  it("is never the viewer's turn once the draft is complete", () => {
    expect(isViewerTurn(draft({ status: "complete", viewerPurchaseId: "p2" }))).toBe(false);
  });

  it("gives one key per owned slot so a multi-slot buyer is re-prompted each turn", () => {
    expect(viewerTurnKey(draft({ viewerPurchaseId: "p2" }))).toBe("p2");
    expect(
      viewerTurnKey(draft({ viewerPurchaseId: "p3", currentTurnPurchaseId: "p3", currentTurnIndex: 2 })),
    ).toBe("p3");
    expect(viewerTurnKey(draft({ viewerPurchaseId: "p9" }))).toBeNull();
  });
});

describe("draftProgress", () => {
  it("counts the pick in progress", () => {
    expect(draftProgress(draft())).toEqual({ current: 2, total: 4 });
  });

  it("shows the final tally once complete", () => {
    expect(draftProgress(draft({ status: "complete", picks: draft().picks.concat(draft().picks) }))).toEqual({
      current: 2,
      total: 4,
    });
  });

  it("defaults to a 16 pick board before the draft exists", () => {
    expect(draftProgress(null)).toEqual({ current: 0, total: 16 });
  });
});

describe("draftPillState", () => {
  it("tells the host to start and buyers to wait before the draft exists", () => {
    expect(draftPillState(null, NOW, { isHost: true })).toEqual({ text: "Randomize draft order", tone: "idle" });
    expect(draftPillState(null, NOW, { isHost: false }).text).toBe("Sweet 16 draft · waiting for host");
    expect(draftPillState(draft({ status: "not_started" }), NOW, { isHost: false }).tone).toBe("idle");
  });

  it("walks the host through randomize -> start, and tells buyers the order is set", () => {
    expect(draftPillState(draft({ status: "order_set" }), NOW, { isHost: true }).text).toBe("Start Sweet 16 draft");
    expect(draftPillState(draft({ status: "order_set" }), NOW, { isHost: false }).text).toBe(
      "Sweet 16 draft · order set",
    );
  });

  it("calls out the viewer's own pick with the clock", () => {
    expect(draftPillState(draft({ viewerPurchaseId: "p2" }), NOW, { isHost: false })).toEqual({
      text: "Your pick · 0:42",
      tone: "turn",
    });
  });

  it("goes urgent in the final seconds", () => {
    const d = draft({
      viewerPurchaseId: "p2",
      currentTurnDeadlineAt: new Date(NOW + SWEET16_URGENT_MS).toISOString(),
    });
    expect(draftPillState(d, NOW, { isHost: false }).tone).toBe("urgent");
  });

  it("shows overall progress to everyone else", () => {
    expect(draftPillState(draft(), NOW, { isHost: false }).text).toBe("Sweet 16 draft · pick 2 of 4 · 0:42");
  });

  it("marks a finished draft as done", () => {
    expect(draftPillState(draft({ status: "complete" }), NOW, { isHost: false })).toEqual({
      text: "Sweet 16 draft · complete",
      tone: "done",
    });
  });
});

function variant(label: string, i: number, patch: Partial<LiveItemVariantDTO> = {}): LiveItemVariantDTO {
  return {
    id: `v${i}`,
    liveRoomItemId: "item1",
    label,
    priceUsd: 25,
    quantityInitial: 1,
    quantityRemaining: 1,
    soldCount: 0,
    isHot: false,
    imageUrl: "",
    color: "",
    sortOrder: i,
    status: "available",
    buyerUsername: null,
    ...patch,
  };
}

function soldVariant(label: string, i: number, buyer: string): LiveItemVariantDTO {
  return variant(label, i, { quantityRemaining: 0, soldCount: 1, status: "sold_out", buyerUsername: buyer });
}

/** 32 teams, the first `sold` of them bought. */
function board32(sold: number): LiveItemVariantDTO[] {
  return Array.from({ length: 32 }, (_, i) =>
    i < sold ? soldVariant(`Team ${i}`, i, `buyer${i}`) : variant(`Team ${i}`, i),
  );
}

describe("sweet16SalesStatus", () => {
  it("is null for every non-draft lot", () => {
    expect(sweet16SalesStatus({ variantAssignmentMode: "pick", variants: board32(3), variantBreakReadyAt: null })).toBeNull();
    expect(sweet16SalesStatus(null)).toBeNull();
    expect(isSweet16DraftItem({ variantAssignmentMode: "random" })).toBe(false);
    expect(isSweet16DraftItem({ variantAssignmentMode: "draft" })).toBe(true);
  });

  it("counts sold teams out of 16, not out of the 32 on the board", () => {
    const s = sweet16SalesStatus({ variantAssignmentMode: "draft", variants: board32(7), variantBreakReadyAt: null });
    expect(s).toEqual({ sold: 7, max: 16, closed: false, label: "7 of 16 sold" });
  });

  it("closes sales at 16 sold even before the ready flag lands", () => {
    const s = sweet16SalesStatus({ variantAssignmentMode: "draft", variants: board32(16), variantBreakReadyAt: null });
    expect(s?.closed).toBe(true);
    expect(s?.label).toBe("Sales closed — 16 teams sold");
  });

  it("closes sales when the server's ready flag is set", () => {
    const s = sweet16SalesStatus({
      variantAssignmentMode: "draft",
      variants: board32(15),
      variantBreakReadyAt: new Date(NOW).toISOString(),
    });
    expect(s).toMatchObject({ sold: 16, closed: true });
  });

  it("ignores removed teams and still works for a legacy Slot N board", () => {
    const legacy = Array.from({ length: 16 }, (_, i) =>
      i < 4 ? soldVariant(`Slot ${i + 1}`, i, `b${i}`) : variant(`Slot ${i + 1}`, i),
    );
    legacy.push(variant("Slot 17", 17, { status: "removed", quantityRemaining: 0 }));
    expect(sweet16SalesStatus({ variantAssignmentMode: "draft", variants: legacy, variantBreakReadyAt: null })?.label).toBe(
      "4 of 16 sold",
    );
  });
});

describe("sweet16Board", () => {
  const item = { variants: board32(2).reverse() };

  it("builds a sorted 32 tile board from the lot before the draft exists", () => {
    const tiles = sweet16BoardFromItem(item);
    expect(tiles).toHaveLength(32);
    expect(tiles[0]).toMatchObject({ label: "Team 0", state: "purchased", buyerUsername: "buyer0" });
    expect(tiles[5]).toMatchObject({ label: "Team 5", state: "open", buyerUsername: null });
    expect(sweet16BoardCounts(tiles)).toEqual({ open: 30, purchased: 2, drafted: 0 });
  });

  it("prefers the server board once the draft exists", () => {
    const serverBoard = [
      { label: "Chiefs", abbr: "KC", state: "drafted" as const, buyerUsername: "amy", purchaseId: "p1" },
    ];
    expect(sweet16Board(draft({ board: serverBoard }), item)).toBe(serverBoard);
    expect(sweet16Board(draft({ board: [] }), item)).toHaveLength(32);
    expect(sweet16Board(null, null)).toEqual([]);
  });

  it("captions tiles by owner and how they got it", () => {
    expect(sweet16TileCaption({ label: "a", abbr: "a", state: "open", buyerUsername: null, purchaseId: null })).toBe("Open");
    expect(
      sweet16TileCaption({ label: "a", abbr: "a", state: "purchased", buyerUsername: "amy", purchaseId: "p" }),
    ).toBe("Bought by @amy");
    expect(
      sweet16TileCaption({ label: "a", abbr: "a", state: "drafted", buyerUsername: "bob", purchaseId: "p" }),
    ).toBe("Drafted by @bob");
  });

  it("only lets the viewer select open teams still in the pool", () => {
    const d = draft({ remainingTeamLabels: ["Bills", "Jets"] });
    const open = (label: string) => ({ label, abbr: label, state: "open" as const, buyerUsername: null, purchaseId: null });
    expect(isSweet16TileSelectable(d, open("Bills"))).toBe(true);
    expect(isSweet16TileSelectable(d, open("Chiefs"))).toBe(false);
    expect(isSweet16TileSelectable(d, { ...open("Bills"), state: "drafted" })).toBe(false);
    expect(isSweet16TileSelectable(null, open("Bills"))).toBe(false);
    expect(isSweet16TileSelectable(draft({ remainingTeamLabels: [] }), open("Chiefs"))).toBe(true);
  });
});

describe("draft order + results", () => {
  const order = [
    { purchaseId: "p1", turnIndex: 0, buyerUsername: "amy", boughtTeamLabel: "Chiefs", boughtTeamAbbr: "KC" },
    { purchaseId: "p2", turnIndex: 1, buyerUsername: "bob", boughtTeamLabel: "Eagles", boughtTeamAbbr: "PHI" },
    { purchaseId: "p3", turnIndex: 2, buyerUsername: "amy", boughtTeamLabel: "Lions", boughtTeamAbbr: "DET" },
  ];

  it("numbers the order and marks done / current / upcoming and the viewer's own row", () => {
    const rows = sweet16OrderRows(draft({ order: [...order].reverse(), viewerPurchaseId: "p3" }));
    expect(rows.map((r) => [r.position, r.buyerUsername, r.state, r.mine])).toEqual([
      [1, "amy", "done", false],
      [2, "bob", "current", false],
      [3, "amy", "upcoming", true],
    ]);
    expect(rows[0]?.draftedTeamLabel).toBe("Chiefs");
  });

  it("is empty before the order is set", () => {
    expect(sweet16OrderRows(draft({ order: [] }))).toEqual([]);
    expect(sweet16OrderRows(null)).toEqual([]);
  });

  it("treats every row as upcoming while the order is set but the draft has not started", () => {
    const rows = sweet16OrderRows(draft({ status: "order_set", order, picks: [], currentTurnPurchaseId: null }));
    expect(rows.every((r) => r.state === "upcoming")).toBe(true);
  });

  it("groups final results per buyer: bought team then drafted team", () => {
    const picks = [
      { purchaseId: "p1", turnIndex: 0, teamLabel: "Jets", teamAbbr: "NYJ", autoAssigned: false, buyerUsername: "amy" },
      { purchaseId: "p2", turnIndex: 1, teamLabel: "Bills", teamAbbr: "BUF", autoAssigned: true, buyerUsername: "bob" },
      { purchaseId: "p3", turnIndex: 2, teamLabel: "Bears", teamAbbr: "CHI", autoAssigned: false, buyerUsername: "amy" },
    ];
    expect(sweet16BuyerResults(draft({ status: "complete", order, picks }))).toEqual([
      { buyerUsername: "amy", teams: ["Chiefs", "Jets", "Lions", "Bears"] },
      { buyerUsername: "bob", teams: ["Eagles", "Bills"] },
    ]);
  });
});

describe("nextTurnPrompt", () => {
  it("pops up once for a new turn of the viewer's", () => {
    expect(nextTurnPrompt(null, "p2")).toEqual({ open: true, nextKey: "p2" });
  });

  it("does not re-pop for the same turn after the buyer dismissed the sheet", () => {
    expect(nextTurnPrompt("p2", "p2")).toEqual({ open: false, nextKey: "p2" });
  });

  it("pops again for the buyer's next owned team, and resets when it is not their turn", () => {
    expect(nextTurnPrompt("p2", "p5")).toEqual({ open: true, nextKey: "p5" });
    expect(nextTurnPrompt("p2", null)).toEqual({ open: false, nextKey: null });
    expect(nextTurnPrompt(null, null)).toEqual({ open: false, nextKey: null });
  });
});

describe("sweet16ErrorMessage", () => {
  it("maps known server codes to friendly copy", () => {
    expect(sweet16ErrorMessage(new Sweet16RequestError(409, "x", "NOT_READY"), "fb")).toMatch(/16 teams must be sold/);
    expect(sweet16ErrorMessage(new Sweet16RequestError(409, "x", "PAYMENTS_PENDING"), "fb")).toMatch(/processing/);
    expect(sweet16ErrorMessage(new Sweet16RequestError(409, "x", "ORDER_NOT_SET"), "fb")).toBe(
      "Randomize the draft order first.",
    );
  });

  it("falls back to the server message, then the fallback", () => {
    expect(sweet16ErrorMessage(new Sweet16RequestError(500, "Boom", "WHO_KNOWS"), "fb")).toBe("Boom");
    expect(sweet16ErrorMessage(new Error("net down"), "fb")).toBe("net down");
    expect(sweet16ErrorMessage("weird", "fb")).toBe("fb");
  });
});
