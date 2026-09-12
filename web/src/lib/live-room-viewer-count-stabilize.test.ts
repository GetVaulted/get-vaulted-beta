import { describe, expect, it } from "vitest";
import {
  createViewerCountStabilizerState,
  nextStabilizedViewerCount,
  resolveDisplayedViewerCount,
} from "./live-room-viewer-count-stabilize";

describe("nextStabilizedViewerCount", () => {
  it("applies the first reading immediately", () => {
    const next = nextStabilizedViewerCount(createViewerCountStabilizerState(), 4, 1_000);
    expect(next.displayed).toBe(4);
  });

  it("applies increases immediately", () => {
    let state = nextStabilizedViewerCount(createViewerCountStabilizerState(), 2, 1_000);
    state = nextStabilizedViewerCount(state, 5, 1_100);
    expect(state.displayed).toBe(5);
  });

  it("holds decreases until they stay low long enough", () => {
    let state = nextStabilizedViewerCount(createViewerCountStabilizerState(), 5, 1_000);
    state = nextStabilizedViewerCount(state, 3, 1_500);
    expect(state.displayed).toBe(5);
    state = nextStabilizedViewerCount(state, 3, 2_000);
    expect(state.displayed).toBe(5);
    state = nextStabilizedViewerCount(state, 3, 4_100);
    expect(state.displayed).toBe(3);
  });

  it("cancels a pending decrease when the count rises again", () => {
    let state = nextStabilizedViewerCount(createViewerCountStabilizerState(), 5, 1_000);
    state = nextStabilizedViewerCount(state, 2, 1_500);
    state = nextStabilizedViewerCount(state, 6, 2_000);
    expect(state.displayed).toBe(6);
    expect(state.pendingDecrease).toBeNull();
  });
});

describe("resolveDisplayedViewerCount", () => {
  it("prefers a fresh host broadcast over local", () => {
    expect(
      resolveDisplayedViewerCount({
        broadcastCount: 12,
        broadcastAtMs: 10_000,
        localCount: 9,
        nowMs: 15_000,
      }),
    ).toBe(12);
  });

  it("falls back to local when the broadcast is stale", () => {
    expect(
      resolveDisplayedViewerCount({
        broadcastCount: 12,
        broadcastAtMs: 1_000,
        localCount: 9,
        nowMs: 20_000,
      }),
    ).toBe(9);
  });
});
