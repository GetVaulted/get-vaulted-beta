import { describe, expect, it } from "vitest";
import { isLiveRoomBroadcastOnAir } from "@/lib/live-room-broadcast-on-air";

describe("isLiveRoomBroadcastOnAir", () => {
  it("requires live lifecycle and stream signal", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: false }),
    ).toBe(true);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "connecting", streamPaused: false }),
    ).toBe(true);
  });

  it("blocks scheduled rooms and offline streams", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "scheduled", streamHealth: "live", streamPaused: false }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "offline", streamPaused: false }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: true }),
    ).toBe(false);
  });
});
