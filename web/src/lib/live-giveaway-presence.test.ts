import { describe, expect, it } from "vitest";
import {
  GIVEAWAY_LEAVE_GRACE_MS,
  isGiveawayEntryEligibleForDraw,
  isWatchEnterGiveawayMethod,
  shouldIgnoreLeaveNotice,
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

describe("shouldIgnoreLeaveNotice", () => {
  const now = new Date("2026-10-25T00:53:30.000Z");

  it("ignores a leave right after the viewer was confirmed present", () => {
    expect(shouldIgnoreLeaveNotice(new Date(now.getTime() - 100), now)).toBe(true);
    expect(shouldIgnoreLeaveNotice(new Date(now.getTime() - (GIVEAWAY_LEAVE_GRACE_MS - 1)), now)).toBe(true);
  });

  it("trusts a leave once the grace window has passed", () => {
    expect(shouldIgnoreLeaveNotice(new Date(now.getTime() - GIVEAWAY_LEAVE_GRACE_MS), now)).toBe(false);
    expect(shouldIgnoreLeaveNotice(new Date(now.getTime() - 60_000), now)).toBe(false);
  });

  it("trusts a leave when presence was never stamped (older rows)", () => {
    expect(shouldIgnoreLeaveNotice(null, now)).toBe(false);
    expect(shouldIgnoreLeaveNotice(undefined, now)).toBe(false);
  });

  it("does not ignore a leave when the stamp is in the future (clock skew)", () => {
    expect(shouldIgnoreLeaveNotice(new Date(now.getTime() + 5_000), now)).toBe(false);
  });
});
