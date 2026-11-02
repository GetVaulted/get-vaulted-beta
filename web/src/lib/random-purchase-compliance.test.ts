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

  it("has no cooling-off pause while it is turned off", () => {
    expect(RANDOM_PURCHASE_COOLING_EVERY).toBe(0);
    const tenJustNow = Array.from({ length: 10 }, (_, i) => ago((i + 1) * MIN));
    expect(evaluateRandomPurchaseLimits(tenJustNow, NOW)).toEqual({ allowed: true });
    expect(RANDOM_PURCHASE_COOLING_MS).toBeGreaterThan(0);
  });

  it("does not pause on purchases that are not a multiple of N", () => {
    const some = Array.from({ length: 7 }, (_, i) => ago((i + 1) * MIN));
    expect(evaluateRandomPurchaseLimits(some, NOW)).toEqual({ allowed: true });
  });
});
