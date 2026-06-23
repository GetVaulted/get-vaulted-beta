import { describe, expect, it } from "vitest";
import {
  isGiveawayEntryEligibleForDraw,
  isWatchEnterGiveawayMethod,
} from "./live-giveaway-presence";

describe("live-giveaway-presence", () => {
  it("treats watch_enter rows as pausable", () => {
    expect(isWatchEnterGiveawayMethod("watch_enter")).toBe(true);
    expect(isWatchEnterGiveawayMethod("purchase")).toBe(false);
    expect(isWatchEnterGiveawayMethod("amoe_form")).toBe(false);
  });

  it("excludes inactive watch_enter rows from the draw pool", () => {
    expect(
      isGiveawayEntryEligibleForDraw({ method: "watch_enter", activeInRoom: false }),
    ).toBe(false);
    expect(
      isGiveawayEntryEligibleForDraw({ method: "watch_enter", activeInRoom: true }),
    ).toBe(true);
  });

  it("keeps purchase and AMOE rows in the draw pool regardless of room presence", () => {
    expect(
      isGiveawayEntryEligibleForDraw({ method: "purchase", activeInRoom: false }),
    ).toBe(true);
    expect(
      isGiveawayEntryEligibleForDraw({ method: "amoe_form", activeInRoom: false }),
    ).toBe(true);
  });
});
