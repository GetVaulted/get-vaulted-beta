import { describe, expect, it } from "vitest";
import {
  RANDOM_PURCHASE_COOLING_EVERY,
  RANDOM_PURCHASE_COOLING_MS,
  RANDOM_PURCHASE_DAILY_CAP,
  RANDOM_PURCHASE_WINDOW_MS,
  evaluateRandomPurchaseLimits,
} from "./random-purchase-compliance";

const NOW = new Date("2026-10-09T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;

describe("evaluateRandomPurchaseLimits", () => {
  it("allows a buyer with no recent purchases", () => {
    expect(evaluateRandomPurchaseLimits([], NOW)).toEqual({ allowed: true });
  });

  it("ignores purchases older than the 24 hour window", () => {
    const old = Array.from({ length: RANDOM_PURCHASE_DAILY_CAP }, () => ago(RANDOM_PURCHASE_WINDOW_MS + MIN));
    expect(evaluateRandomPurchaseLimits(old, NOW)).toEqual({ allowed: true });
  });

  it("blocks at the daily cap and says when the oldest purchase ages out", () => {
    const times = Array.from({ length: RANDOM_PURCHASE_DAILY_CAP }, (_, i) => ago(5 * MIN + (RANDOM_PURCHASE_DAILY_CAP - i) * 60 * MIN));
    const r = evaluateRandomPurchaseLimits(times, NOW);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.code).toBe("RANDOM_PURCHASE_DAILY_CAP");
      expect(r.retryAt.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("starts a cooling-off pause after every Nth purchase, then lifts it", () => {
    const justNow = Array.from({ length: RANDOM_PURCHASE_COOLING_EVERY }, (_, i) => ago((i + 1) * MIN));
    const blocked = evaluateRandomPurchaseLimits(justNow, NOW);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.code).toBe("RANDOM_PURCHASE_COOLING_OFF");

    const later = new Date(NOW.getTime() + RANDOM_PURCHASE_COOLING_MS + MIN);
    expect(evaluateRandomPurchaseLimits(justNow, later)).toEqual({ allowed: true });
  });

  it("does not pause on purchases that are not a multiple of N", () => {
    const some = Array.from({ length: RANDOM_PURCHASE_COOLING_EVERY - 3 }, (_, i) => ago((i + 1) * MIN));
    expect(evaluateRandomPurchaseLimits(some, NOW)).toEqual({ allowed: true });
  });
});
