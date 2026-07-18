import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calendarDayBoundsUtc,
  calendarDayInTimeZone,
  zonedLocalToUtc,
} from "./calendar-day-bounds";

describe("calendarDayBoundsUtc", () => {
  it("returns a 24h window for America/Chicago on a non-DST day", () => {
    const { start, end } = calendarDayBoundsUtc("2026-01-15", "America/Chicago");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // CST = UTC-6 → midnight Chicago = 06:00 UTC
    expect(start.toISOString()).toBe("2026-01-15T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-16T06:00:00.000Z");
  });

  it("handles spring-forward (23h civil day) in America/Chicago", () => {
    const { start, end } = calendarDayBoundsUtc("2026-03-08", "America/Chicago");
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});

describe("calendarDayInTimeZone", () => {
  it("maps a UTC instant to the local calendar day", () => {
    // 2026-01-15 05:30 UTC is still Jan 14 evening in Chicago
    const instant = new Date("2026-01-15T05:30:00.000Z");
    expect(calendarDayInTimeZone(instant, "America/Chicago")).toBe("2026-01-14");
  });
});

describe("addCalendarDays / zonedLocalToUtc", () => {
  it("adds calendar days across month boundaries", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("zonedLocalToUtc matches midnight bounds start", () => {
    const a = zonedLocalToUtc(2026, 7, 18, 0, 0, 0, "America/Chicago");
    const { start } = calendarDayBoundsUtc("2026-07-18", "America/Chicago");
    expect(a.getTime()).toBe(start.getTime());
  });
});
