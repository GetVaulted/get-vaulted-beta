import { describe, expect, it } from "vitest";
import { mapApiRowToLiveNowRoom, resolveLiveNowCardImageUrl, type LiveRoomListApiRow } from "./live-room-directory-mapper";

function baseRow(over: Partial<LiveRoomListApiRow> = {}): LiveRoomListApiRow {
  return {
    id: "room_1",
    title: "$15 Start Pick Yor Division",
    description: null,
    category: "Breaks",
    roomType: "auction",
    status: "scheduled",
    thumbnailUrl: "",
    viewerCount: 0,
    scheduledStartAt: "2026-07-28T22:30:00.000Z",
    startedAt: null,
    endedAt: null,
    sellerUsername: "host",
    itemCount: 1,
    activeItemTitle: null,
    teamBoardLeague: "nfl",
    ...over,
  };
}

describe("resolveLiveNowCardImageUrl", () => {
  it("prefers API previewImageUrl (mobile parity)", () => {
    expect(
      resolveLiveNowCardImageUrl(
        baseRow({
          previewImageUrl: "https://cdn.example/preview.jpg",
          firstItemImageUrl: "https://cdn.example/item.jpg",
          sellerAvatarUrl: "https://cdn.example/avatar.jpg",
        }),
      ),
    ).toBe("https://cdn.example/preview.jpg");
  });

  it("falls back to first item image when thumbnail empty", () => {
    expect(
      resolveLiveNowCardImageUrl(
        baseRow({
          firstItemImageUrl: "https://cdn.example/item.jpg",
        }),
      ),
    ).toBe("https://cdn.example/item.jpg");
  });

  it("falls back to seller avatar before category art", () => {
    expect(
      resolveLiveNowCardImageUrl(
        baseRow({
          sellerAvatarUrl: "https://cdn.example/avatar.jpg",
        }),
      ),
    ).toBe("https://cdn.example/avatar.jpg");
  });
});

describe("mapApiRowToLiveNowRoom", () => {
  it("puts preview cover on card thumbnailUrl", () => {
    const room = mapApiRowToLiveNowRoom(
      baseRow({
        previewImageUrl: "https://cdn.example/host-or-item.jpg",
        thumbnailUrl: "",
      }),
    );
    expect(room.thumbnailUrl).toBe("https://cdn.example/host-or-item.jpg");
  });
});
