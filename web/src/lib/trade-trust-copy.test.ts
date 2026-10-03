import { describe, expect, it } from "vitest";
import {
  TRADE_BUYER_PITCH,
  TRADE_COVERS_BULLETS,
  TRADE_HANDLES_BULLETS,
  TRADE_HOW_IT_WORKS_STEPS,
  TRADE_HUB_HERO_SUB,
} from "./trade-trust-copy";

describe("trade-trust-copy", () => {
  it("states no escrow and avoids deal-room marketing", () => {
    const blob = [
      TRADE_BUYER_PITCH,
      TRADE_HUB_HERO_SUB,
      ...TRADE_HOW_IT_WORKS_STEPS,
      ...TRADE_COVERS_BULLETS,
      ...TRADE_HANDLES_BULLETS,
    ].join(" ");
    expect(blob.toLowerCase()).not.toMatch(/deal rooms?/);
    expect(TRADE_BUYER_PITCH.toLowerCase()).toMatch(/doesn.t hold/);
    expect(TRADE_BUYER_PITCH.toLowerCase()).toContain("escrow");
  });

  it("explains fee + label and optional cash", () => {
    expect(TRADE_COVERS_BULLETS.some((b) => b.includes("$2.99"))).toBe(true);
    expect(TRADE_HANDLES_BULLETS.some((b) => /cash/i.test(b))).toBe(true);
  });
});
