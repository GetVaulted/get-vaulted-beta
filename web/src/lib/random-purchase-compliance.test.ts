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

  it("has no daily cap while it is turned off", () => {
    expect(RANDOM_PURCHASE_DAILY_CAP).toBe(0);
    const many = Array.from({ length: 200 }, (_, i) => ago((i + 1) * MIN));
    expect(evaluateRandomPurchaseLimits(many, NOW)).toEqual({ allowed: true });
    expect(RANDOM_PURCHASE_WINDOW_MS).toBeGreaterThan(0);
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
