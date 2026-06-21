import { describe, expect, it } from "vitest";
import {
  liveBidMetaFallbackPollMs,
  liveChatFallbackPollMs,
  liveRoomReconcilePollMs,
} from "./live-fallback-poll-intervals";

describe("live-fallback-poll-intervals", () => {
  it("uses slow reconcile when realtime is connected during live", () => {
    expect(liveRoomReconcilePollMs({ hasRealtime: true, wantsTightPoll: true })).toBe(12_000);
  });

  it("uses tighter reconcile when realtime is unavailable during live", () => {
    expect(liveRoomReconcilePollMs({ hasRealtime: false, wantsTightPoll: true })).toBe(3_000);
  });

  it("relaxes chat and bid polls with realtime", () => {
    expect(liveChatFallbackPollMs(true)).toBe(5_000);
    expect(liveChatFallbackPollMs(false)).toBe(2_000);
    expect(liveBidMetaFallbackPollMs(true)).toBe(2_500);
    expect(liveBidMetaFallbackPollMs(false)).toBe(850);
  });
});
