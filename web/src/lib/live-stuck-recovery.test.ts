import { describe, expect, it } from "vitest";
import {
  STUCK_LIVE_AUTO_END_MS,
  STUCK_LIVE_GRACE_MS,
  STUCK_LIVE_WARN_MS,
  decideStuckLiveAction,
} from "./live-stuck-recovery";

describe("decideStuckLiveAction", () => {
  it("is healthy whenever a publisher is present", () => {
    expect(
      decideStuckLiveAction({ hasPublisher: true, msSinceStreamStart: 0, msSincePublisherAbsent: Infinity }),
    ).toBe("healthy");
  });

  it("waits during the go-live grace window even with no publisher", () => {
    expect(
      decideStuckLiveAction({
        hasPublisher: false,
        msSinceStreamStart: STUCK_LIVE_GRACE_MS - 1,
        msSincePublisherAbsent: STUCK_LIVE_AUTO_END_MS,
      }),
    ).toBe("wait");
  });

  it("waits when absence just started (past grace)", () => {
    expect(
      decideStuckLiveAction({
        hasPublisher: false,
        msSinceStreamStart: STUCK_LIVE_GRACE_MS + 10_000,
        msSincePublisherAbsent: 5_000,
      }),
    ).toBe("wait");
  });

  it("warns when the publisher has been absent past the warn threshold", () => {
    expect(
      decideStuckLiveAction({
        hasPublisher: false,
        msSinceStreamStart: 10 * 60_000,
        msSincePublisherAbsent: STUCK_LIVE_WARN_MS,
      }),
    ).toBe("warn_rejoin");
  });

  it("auto-ends when the publisher has been absent past the auto-end threshold", () => {
    expect(
      decideStuckLiveAction({
        hasPublisher: false,
        msSinceStreamStart: 10 * 60_000,
        msSincePublisherAbsent: STUCK_LIVE_AUTO_END_MS,
      }),
    ).toBe("auto_end");
  });
});
