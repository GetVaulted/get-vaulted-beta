import { describe, expect, it } from "vitest";
import { filterStaffMessagesForViewer, isStaffLiveRoomMessageType } from "@/lib/live-room-staff-chat";

describe("live-room-staff-chat", () => {
  it("detects staff message type", () => {
    expect(isStaffLiveRoomMessageType("staff")).toBe(true);
    expect(isStaffLiveRoomMessageType("chat")).toBe(false);
  });

  it("hides staff rows from buyers", () => {
    const rows = [
      { id: "1", messageType: "chat" },
      { id: "2", messageType: "staff" },
      { id: "3", messageType: "system" },
    ];
    expect(filterStaffMessagesForViewer(rows, false).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterStaffMessagesForViewer(rows, true).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});
