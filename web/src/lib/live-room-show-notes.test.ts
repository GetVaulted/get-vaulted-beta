import { describe, expect, it } from "vitest";
import { buildLiveRoomDetail, type LiveRoomDetailPayload } from "./live-room-serialize";

describe("live room showNotes vs description", () => {
  it("serializes showNotes separately from description", () => {
    const room = {
      id: "r1",
      sellerId: "s1",
      title: "Show",
      description: "Public directory blurb",
      showNotes: "In-room notes for buyers",
      category: "Other",
      roomType: "auction",
      status: "live",
      discoveryVisibility: "public",
      thumbnailUrl: "",
      viewerCount: 0,
      streamProvider: "none",
      streamMode: "stage_webrtc",
      streamHealth: "live",
      roomVersion: 1,
      auctionEventSeq: 0,
      completedSalesGmvUsd: 0,
      tipRecipientMode: "host",
      tipModeratorId: null,
      tipModerator: null,
      teamBoardLeague: "nfl",
      scheduledStartAt: null,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      endedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      seller: { username: "host", image: null },
      items: [],
      messages: [],
    } as unknown as LiveRoomDetailPayload;

    const dto = buildLiveRoomDetail(room);
    expect(dto.description).toBe("Public directory blurb");
    expect(dto.showNotes).toBe("In-room notes for buyers");
  });
});
