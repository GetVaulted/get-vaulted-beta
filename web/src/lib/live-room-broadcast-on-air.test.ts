import { describe, expect, it } from "vitest";
import {
  isLiveRoomBroadcastOnAir,
  isLiveStreamDisconnectConfirmed,
} from "@/lib/live-room-broadcast-on-air";

describe("isLiveRoomBroadcastOnAir", () => {
  it("requires live lifecycle and stream signal", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: false }),
    ).toBe(true);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "connecting", streamPaused: false }),
    ).toBe(true);
  });

  it("allows warm-up offline before IVS marks the channel live", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "offline", streamPaused: false }),
    ).toBe(true);
  });

  it("blocks scheduled rooms, paused streams, and confirmed disconnects", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "scheduled", streamHealth: "live", streamPaused: false }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: true }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("keeps stage WebRTC commerce open while the channel mirror is offline", () => {
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
      }),
    ).toBe(true);
  });
});

describe("isLiveStreamDisconnectConfirmed", () => {
  it("detects ended streams and post-live offline windows", () => {
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "ended",
        streamPaused: false,
      }),
    ).toBe(true);
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(true);
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
      }),
    ).toBe(false);
  });
});
