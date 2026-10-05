import { describe, expect, it } from "vitest";
import {
  SWEET16_URGENT_MS,
  draftPillState,
  draftProgress,
  formatDraftCountdown,
  isViewerTurn,
  turnRemainingMs,
  viewerTurnKey,
  type Sweet16Draft,
} from "./sweet16-draft-client";

const NOW = Date.parse("2026-10-05T18:00:00.000Z");

function draft(patch: Partial<Sweet16Draft> = {}): Sweet16Draft {
  return {
    itemId: "item1",
    liveRoomId: "room1",
    status: "in_progress",
    turnOrder: ["p1", "p2", "p3", "p4"],
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
    expect(draftPillState(null, NOW, { isHost: true })).toEqual({ text: "Start Sweet 16 draft", tone: "idle" });
    expect(draftPillState(null, NOW, { isHost: false }).text).toBe("Sweet 16 draft · waiting for host");
    expect(draftPillState(draft({ status: "not_started" }), NOW, { isHost: false }).tone).toBe("idle");
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
