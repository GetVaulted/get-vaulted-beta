import { describe, expect, it } from "vitest";
import {
  LIVE_VIEWER_COUNT_MAX_AGE_MS,
  effectiveLiveRoomViewerCount,
} from "./live-room-viewer-count-freshness";

describe("effectiveLiveRoomViewerCount", () => {
  const now = Date.parse("2026-08-01T16:00:00.000Z");

  it("returns 0 when count is 0", () => {
    expect(
      effectiveLiveRoomViewerCount({
        viewerCount: 0,
        viewerCountUpdatedAt: new Date(now),
        nowMs: now,
      }),
    ).toBe(0);
  });

  it("returns live count when freshly updated", () => {
    expect(
      effectiveLiveRoomViewerCount({
        viewerCount: 3,
        viewerCountUpdatedAt: new Date(now - 5_000),
        nowMs: now,
      }),
    ).toBe(3);
  });

  it("expires stale snapshots so discovery matches empty presence", () => {
    expect(
      effectiveLiveRoomViewerCount({
        viewerCount: 3,
        viewerCountUpdatedAt: new Date(now - LIVE_VIEWER_COUNT_MAX_AGE_MS - 1),
        nowMs: now,
      }),
    ).toBe(0);
  });

  it("treats missing updatedAt as stale (pre-migration inflation)", () => {
    expect(
      effectiveLiveRoomViewerCount({
        viewerCount: 3,
        viewerCountUpdatedAt: null,
        nowMs: now,
      }),
    ).toBe(0);
  });
});
