import { describe, expect, it } from "vitest";
import {
  formatScheduledStartLong,
  getCountdownParts,
  pad2,
  parseScheduledStartMs,
  resolveScheduledPrereleasePhase,
  SCHEDULED_PRESHOW_WINDOW_MS,
} from "@/lib/live-stream-scheduled";

describe("live-stream-scheduled", () => {
  it("parseScheduledStartMs", () => {
    expect(parseScheduledStartMs(null)).toBeNull();
    expect(parseScheduledStartMs("")).toBeNull();
    expect(parseScheduledStartMs("not-a-date")).toBeNull();
    expect(parseScheduledStartMs("2026-05-10T19:00:00.000Z")).toBe(Date.parse("2026-05-10T19:00:00.000Z"));
  });

  it("resolveScheduledPrereleasePhase — not applicable when room is live", () => {
    const t = Date.now();
    expect(resolveScheduledPrereleasePhase(t, t + 60_000, true)).toBe("not_applicable");
  });

  it("resolveScheduledPrereleasePhase — more than 3 hours before start", () => {
    const start = Date.parse("2026-06-01T12:00:00.000Z");
    const now = start - SCHEDULED_PRESHOW_WINDOW_MS - 60_000;
    expect(resolveScheduledPrereleasePhase(now, start, false)).toBe("far");
  });

  it("resolveScheduledPrereleasePhase — within 3 hours shows countdown", () => {
    const start = Date.parse("2026-06-01T12:00:00.000Z");
    const now = start - 2 * 60 * 60 * 1000;
    expect(resolveScheduledPrereleasePhase(now, start, false)).toBe("countdown");
  });

  it("resolveScheduledPrereleasePhase — at or after start", () => {
    const start = Date.parse("2026-06-01T12:00:00.000Z");
    expect(resolveScheduledPrereleasePhase(start, start, false)).toBe("post_start");
    expect(resolveScheduledPrereleasePhase(start + 1000, start, false)).toBe("post_start");
  });

  it("resolveScheduledPrereleasePhase — no schedule", () => {
    expect(resolveScheduledPrereleasePhase(Date.now(), null, false)).toBe("no_schedule");
  });

  it("formatScheduledStartLong returns a non-empty localized string", () => {
    const s = formatScheduledStartLong("2026-06-15T18:30:00.000Z");
    expect(s.length).toBeGreaterThan(10);
    expect(s).toMatch(/2026/);
  });

  it("getCountdownParts and pad2", () => {
    const start = Date.parse("2026-01-01T01:05:07.000Z");
    const now = Date.parse("2026-01-01T01:00:00.000Z");
    expect(getCountdownParts(now, start)).toEqual({ hours: 0, minutes: 5, seconds: 7 });
    expect(pad2(7)).toBe("07");
    expect(pad2(12)).toBe("12");
  });
});
