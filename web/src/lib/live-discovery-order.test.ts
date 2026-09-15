import { describe, expect, it } from "vitest";
import { orderLiveDirectoryRooms, orderScheduledByStartTime } from "@/lib/live-discovery-order";

describe("orderScheduledByStartTime", () => {
  it("orders soonest-first", () => {
    const rows = [
      { id: "aug17", scheduledStartAtIso: "2026-08-17T20:00:00.000Z" },
      { id: "jul20", scheduledStartAtIso: "2026-07-20T20:00:00.000Z" },
      { id: "aug3", scheduledStartAtIso: "2026-08-03T20:00:00.000Z" },
    ];
    expect(orderScheduledByStartTime(rows).map((r) => r.id)).toEqual(["jul20", "aug3", "aug17"]);
  });

  it("pushes missing/invalid starts to the bottom", () => {
    const rows = [
      { id: "tba", scheduledStartAtIso: null },
      { id: "soon", scheduledStartAtIso: "2026-07-20T20:00:00.000Z" },
      { id: "bad", scheduledStartAtIso: "not-a-date" },
    ];
    expect(orderScheduledByStartTime(rows).map((r) => r.id)).toEqual(["soon", "tba", "bad"]);
  });
});

describe("orderLiveDirectoryRooms", () => {
  it("puts live before scheduled, then soonest scheduled", () => {
    const rows = [
      { id: "s-late", status: "scheduled", viewers: 0, scheduledStartAtIso: "2026-08-17T20:00:00.000Z" },
      { id: "live-quiet", status: "live_now", viewers: 3, scheduledStartAtIso: null },
      { id: "s-soon", status: "scheduled", viewers: 0, scheduledStartAtIso: "2026-07-20T20:00:00.000Z" },
      { id: "live-busy", status: "live_now", viewers: 40, scheduledStartAtIso: null },
    ];
    expect(orderLiveDirectoryRooms(rows).map((r) => r.id)).toEqual([
      "live-busy",
      "live-quiet",
      "s-soon",
      "s-late",
    ]);
  });
});
