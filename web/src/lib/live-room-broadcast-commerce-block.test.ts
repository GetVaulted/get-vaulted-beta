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

  it("allows commerce during warm-up before IVS reports live", () => {
    expect(
      getLiveRoomBroadcastCommerceBlock({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
      }),
    ).toBeNull();
  });

  it("blocks when a disconnect was recorded while the room is still live", () => {
    const block = getLiveRoomBroadcastCommerceBlock({
      status: "live",
      streamHealth: "offline",
      streamPaused: false,
      streamStartedAt: new Date("2026-07-02T18:00:00.000Z"),
      streamEndedAt: new Date("2026-07-02T18:05:00.000Z"),
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
