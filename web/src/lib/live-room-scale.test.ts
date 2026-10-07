import { describe, expect, it } from "vitest";
import {
  BIG_ROOM_VIEWERS,
  HOST_COUNT_BIG_MAX_MS,
  HOST_COUNT_BIG_MIN_MS,
  bigRoomPollMs,
  hostCountFreshMs,
  hostCountPublishPlan,
  isBigRoom,
  jitteredDelayMs,
  planPresence,
  presenceInclusionProbability,
  presenceWeightFor,
  reconcileDelayForRoom,
  resolveRoomSizeHint,
  shouldReportViewerCount,
  smoothWeightedCount,
  weightDriftExceeds,
} from "./live-room-scale";
import { summarizeRoomPresence } from "./live-room-presence-count";

/** Small deterministic PRNG so the simulations below never flake. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("room size", () => {
  it("treats rooms at or below the threshold as normal", () => {
    expect(isBigRoom(0)).toBe(false);
    expect(isBigRoom(BIG_ROOM_VIEWERS)).toBe(false);
    expect(isBigRoom(BIG_ROOM_VIEWERS + 1)).toBe(true);
    expect(isBigRoom(null)).toBe(false);
    expect(isBigRoom(Number.NaN)).toBe(false);
    expect(isBigRoom(-5)).toBe(false);
  });
});

describe("presence sampling", () => {
  it("tracks everyone at weight 1 in a normal room (old behaviour)", () => {
    for (const draw of [0, 0.5, 0.999]) {
      expect(planPresence(draw, 40)).toEqual({ track: true, weight: 1, quiet: false });
      expect(planPresence(draw, BIG_ROOM_VIEWERS)).toEqual({ track: true, weight: 1, quiet: false });
    }
  });

  it("samples about 100 viewers in a big room and weights them to stand for the rest", () => {
    expect(presenceInclusionProbability(1000)).toBeCloseTo(0.1, 6);
    expect(presenceWeightFor(0.1)).toBe(10);
    expect(planPresence(0.05, 1000)).toEqual({ track: true, weight: 10, quiet: true });
    expect(planPresence(0.5, 1000)).toEqual({ track: false, weight: 10, quiet: true });
  });

  it("keeps viewers tracked as the room grows only if their draw is still under the shrinking probability", () => {
    const draw = 0.08;
    expect(planPresence(draw, 1000).track).toBe(true); // p = 0.10
    expect(planPresence(draw, 2000).track).toBe(false); // p = 0.05
  });

  it("estimates a 1,000 viewer room within a few percent using ~100 tracked viewers", () => {
    const rand = mulberry32(12345);
    const state: Record<string, unknown> = {};
    let tracked = 0;
    for (let i = 0; i < 1000; i += 1) {
      const draw = rand();
      const plan = planPresence(draw, 1000);
      if (!plan.track) continue;
      tracked += 1;
      state[`slot-${i}`] = [{ tabKey: `room:${i}`, w: plan.weight, nohb: plan.quiet, at: "2000-01-01T00:00:00Z" }];
    }
    const summary = summarizeRoomPresence(state, Date.now());
    expect(tracked).toBeGreaterThan(60);
    expect(tracked).toBeLessThan(140);
    expect(summary.weighted).toBe(true);
    expect(summary.connections).toBe(tracked);
    expect(Math.abs(summary.count - 1000) / 1000).toBeLessThan(0.25);
  });

  it("estimates 10,000 viewers with the same ~100 tracked viewers", () => {
    const rand = mulberry32(777);
    const state: Record<string, unknown> = {};
    for (let i = 0; i < 10_000; i += 1) {
      const plan = planPresence(rand(), 10_000);
      if (!plan.track) continue;
      state[`slot-${i}`] = [{ tabKey: `room:${i}`, w: plan.weight, nohb: true }];
    }
    const summary = summarizeRoomPresence(state);
    expect(summary.connections).toBeLessThan(160);
    expect(Math.abs(summary.count - 10_000) / 10_000).toBeLessThan(0.3);
  });

  it("only re-announces when the weight moved enough to matter", () => {
    expect(weightDriftExceeds(10, 10)).toBe(false);
    expect(weightDriftExceeds(10, 11)).toBe(false);
    expect(weightDriftExceeds(10, 20)).toBe(true);
    expect(weightDriftExceeds(0, 5)).toBe(true);
  });
});

describe("room size hint", () => {
  it("prefers a fresh host broadcast over the snapshot number", () => {
    expect(resolveRoomSizeHint({ broadcastCount: 900, broadcastFresh: true, snapshotHint: 10 })).toBe(900);
    expect(resolveRoomSizeHint({ broadcastCount: 900, broadcastFresh: false, snapshotHint: 10 })).toBe(10);
    expect(resolveRoomSizeHint({ broadcastCount: null, broadcastFresh: true, snapshotHint: null })).toBe(0);
  });
});

describe("viewer count reporting", () => {
  it("never reports when a host is broadcasting the count", () => {
    expect(shouldReportViewerCount({ hint: 5, draw: 0, hostBroadcastFresh: true })).toBe(false);
  });

  it("lets everyone report in a tiny room with no host", () => {
    expect(shouldReportViewerCount({ hint: 5, draw: 0.9, hostBroadcastFresh: false })).toBe(true);
  });

  it("lets only a handful report in a big room with no host", () => {
    const rand = mulberry32(99);
    let reporters = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (shouldReportViewerCount({ hint: 1000, draw: rand(), hostBroadcastFresh: false })) reporters += 1;
    }
    expect(reporters).toBeGreaterThan(0);
    expect(reporters).toBeLessThan(15);
  });
});

describe("refetch spreading", () => {
  it("leaves small rooms untouched", () => {
    expect(reconcileDelayForRoom(250, 20, { rand: () => 0.9 })).toBe(250);
    expect(reconcileDelayForRoom(250, BIG_ROOM_VIEWERS, { sampleable: true, rand: () => 0.99 })).toBe(250);
  });

  it("spreads refetches across a window in a big room", () => {
    expect(reconcileDelayForRoom(250, 1000, { rand: () => 0 })).toBe(250);
    expect(reconcileDelayForRoom(250, 1000, { rand: () => 1 })).toBe(250 + 10_000);
    expect(reconcileDelayForRoom(250, 400, { rand: () => 0.5 })).toBe(250 + 2_000);
  });

  it("skips most refetches for sampleable events in a big room", () => {
    const rand = mulberry32(2024);
    let kept = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (reconcileDelayForRoom(250, 1000, { sampleable: true, rand }) != null) kept += 1;
    }
    // ~150 of 1,000 viewers refetch after a bid instead of all 1,000.
    expect(kept).toBeGreaterThan(90);
    expect(kept).toBeLessThan(220);
  });

  it("caps the load: 100,000 viewers over 100 rooms refetch a bid ~15,000 times, not 100,000", () => {
    const rand = mulberry32(5);
    let kept = 0;
    for (let i = 0; i < 100_000; i += 1) {
      if (reconcileDelayForRoom(250, 1000, { sampleable: true, rand }) != null) kept += 1;
    }
    expect(kept).toBeLessThan(20_000);
  });
});

describe("poll stretching", () => {
  it("does not change small rooms and caps the stretch in big ones", () => {
    expect(bigRoomPollMs(12_000, 30, 8)).toBe(12_000);
    expect(bigRoomPollMs(12_000, 1000, 8)).toBe(Math.round(12_000 * (1 + 1000 / 150)));
    expect(bigRoomPollMs(12_000, 100_000, 8)).toBe(96_000);
    expect(bigRoomPollMs(30_000, 100_000, 4)).toBe(120_000);
  });

  it("jitters within the spread", () => {
    expect(jitteredDelayMs(1000, 0.2, () => 0)).toBe(800);
    expect(jitteredDelayMs(1000, 0.2, () => 1)).toBe(1200);
  });
});

describe("smoothing", () => {
  it("moves toward the new estimate without jumping", () => {
    expect(smoothWeightedCount(null, 900)).toBe(900);
    expect(smoothWeightedCount(1000, 900)).toBe(965);
    expect(smoothWeightedCount(1000, 1000)).toBe(1000);
  });
});

describe("message diet: threshold and hysteresis", () => {
  it("treats 40 viewers as the line between normal and big rooms", () => {
    expect(BIG_ROOM_VIEWERS).toBe(40);
    expect(planPresence(0.9, 40)).toEqual({ track: true, weight: 1, quiet: false });
    expect(planPresence(0.9, 41)).toEqual({ track: true, weight: 1, quiet: true });
  });

  it("tracks everyone but sends no heartbeat in a mid-size room (41 to 100 viewers)", () => {
    for (const size of [41, 70, 100]) {
      expect(planPresence(0.999, size)).toEqual({ track: true, weight: 1, quiet: true });
    }
    expect(planPresence(0.5, 200)).toEqual({ track: false, weight: 2, quiet: true });
  });

  it("keeps a big room big until it drops well under the line", () => {
    expect(isBigRoom(30, true)).toBe(true);
    expect(isBigRoom(28, true)).toBe(false);
    expect(isBigRoom(30, false)).toBe(false);
    expect(planPresence(0.5, 30, true).quiet).toBe(true);
    expect(planPresence(0.5, 28, true).quiet).toBe(false);
  });
});

describe("message diet: host viewer-count broadcast", () => {
  it("keeps the old cadence in normal rooms", () => {
    expect(hostCountPublishPlan(0)).toEqual({ unchangedMs: 5_000, changedMs: 750 });
    expect(hostCountPublishPlan(40)).toEqual({ unchangedMs: 5_000, changedMs: 750 });
    expect(hostCountFreshMs(12)).toBe(12_000);
  });

  it("slows down as a big room grows, never faster than 5s and never slower than 30s", () => {
    expect(hostCountPublishPlan(60).unchangedMs).toBe(HOST_COUNT_BIG_MIN_MS);
    expect(hostCountPublishPlan(300)).toEqual({ unchangedMs: 9_900, changedMs: 9_900 });
    expect(hostCountPublishPlan(1_000).unchangedMs).toBe(HOST_COUNT_BIG_MAX_MS);
    expect(hostCountPublishPlan(50_000).unchangedMs).toBe(HOST_COUNT_BIG_MAX_MS);
  });

  it("makes viewers trust a host count for longer than the host publish interval", () => {
    for (const size of [10, 60, 300, 1_000, 10_000]) {
      expect(hostCountFreshMs(size)).toBeGreaterThanOrEqual(hostCountPublishPlan(size).unchangedMs * 2);
    }
    expect(hostCountFreshMs(1_000)).toBe(75_000);
  });

  it("caps the count-broadcast load at 100 rooms of 1,000 viewers to a few thousand deliveries per second", () => {
    const perRoomPerSecond = (1_000 / (hostCountPublishPlan(1_000).unchangedMs / 1000));
    expect(perRoomPerSecond * 100).toBeLessThan(4_000);
  });
});
