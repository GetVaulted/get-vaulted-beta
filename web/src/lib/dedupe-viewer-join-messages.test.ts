import { describe, expect, it } from "vitest";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { VIEWER_EVENT_JOIN_BODY } from "@/lib/live-room-viewer-events";
import { dedupeViewerJoinChatMessages } from "@/lib/dedupe-viewer-join-messages";

function joinRow(id: string, senderId: string, createdAt: string): LiveRoomMessageDTO {
  return {
    id,
    liveRoomId: "room-1",
    senderId,
    senderUsername: "getvaultedadmin",
    senderAvatarUrl: null,
    body: VIEWER_EVENT_JOIN_BODY,
    messageType: "system",
    createdAt,
    mentions: [],
  };
}

describe("dedupeViewerJoinChatMessages", () => {
  it("keeps one join per sender within the dedupe window", () => {
    const rows = [
      joinRow("1", "user-a", "2026-06-19T00:00:00.000Z"),
      joinRow("2", "user-a", "2026-06-19T00:00:05.000Z"),
      joinRow("3", "user-a", "2026-06-19T00:00:10.000Z"),
      joinRow("4", "user-b", "2026-06-19T00:00:11.000Z"),
    ];
    const out = dedupeViewerJoinChatMessages(rows);
    expect(out.map((m) => m.id)).toEqual(["1", "4"]);
  });
});
