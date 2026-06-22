import { describe, expect, it } from "vitest";
import { buildWeeklyRecurringScheduleDates } from "./live-room-recurring-schedule";

describe("buildWeeklyRecurringScheduleDates", () => {
  it("returns weekly slots through 30 days", () => {
    const first = new Date("2026-06-01T20:00:00.000Z");
    const dates = buildWeeklyRecurringScheduleDates(first, new Date("2026-05-01T00:00:00.000Z"));
    expect(dates).toHaveLength(5);
    expect(dates[0]?.toISOString()).toBe("2026-06-01T20:00:00.000Z");
    expect(dates[4]?.toISOString()).toBe("2026-06-29T20:00:00.000Z");
  });

  it("skips past slots when now is after the first start", () => {
    const first = new Date("2026-06-01T20:00:00.000Z");
    const dates = buildWeeklyRecurringScheduleDates(first, new Date("2026-06-10T12:00:00.000Z"));
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-06-15T20:00:00.000Z",
      "2026-06-22T20:00:00.000Z",
      "2026-06-29T20:00:00.000Z",
    ]);
  });
});
