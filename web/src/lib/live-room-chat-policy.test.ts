import { describe, expect, it } from "vitest";
import { liveRoomChatOpen } from "./live-room-chat-policy";

describe("liveRoomChatOpen", () => {
  it("allows scheduled and live rooms", () => {
    expect(liveRoomChatOpen("scheduled")).toBe(true);
    expect(liveRoomChatOpen("live")).toBe(true);
    expect(liveRoomChatOpen("LIVE")).toBe(true);
  });

  it("blocks ended and unknown statuses", () => {
    expect(liveRoomChatOpen("ended")).toBe(false);
    expect(liveRoomChatOpen("draft")).toBe(false);
    expect(liveRoomChatOpen(null)).toBe(false);
  });
});
