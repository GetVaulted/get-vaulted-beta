import { describe, expect, it } from "vitest";
import { getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import {
  LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
  LIVE_STREAM_PAUSED_COMMERCE_ERROR,
} from "@/lib/live-room-commerce-messages";

describe("getLiveRoomBroadcastCommerceBlock", () => {
  it("allows commerce when the host broadcast is on air", () => {
    expect(
      getLiveRoomBroadcastCommerceBlock({
        status: "live",
        streamHealth: "live",
        streamPaused: false,
      }),
    ).toBeNull();
  });

  it("blocks when the stream is offline while the room is live", () => {
    const block = getLiveRoomBroadcastCommerceBlock({
      status: "live",
      streamHealth: "offline",
      streamPaused: false,
    });
    expect(block?.code).toBe("LIVE_BROADCAST_OFFLINE");
    expect(block?.error).toBe(LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR);
  });

  it("blocks when the host paused the stream", () => {
    const block = getLiveRoomBroadcastCommerceBlock({
      status: "live",
      streamHealth: "live",
      streamPaused: true,
    });
    expect(block?.code).toBe("LIVE_STREAM_PAUSED");
    expect(block?.error).toBe(LIVE_STREAM_PAUSED_COMMERCE_ERROR);
  });
});
