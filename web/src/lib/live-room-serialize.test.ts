import { describe, expect, it } from "vitest";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";

describe("serializeLiveRoomMessage", () => {
  it("falls back when sender relation is missing", () => {
    const row = {
      id: "m1",
      liveRoomId: "room-1",
      senderId: "u1",
      body: "Lot started",
      messageType: "system" as const,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      sender: null,
    };
    expect(serializeLiveRoomMessage(row)).toMatchObject({
      senderUsername: "System",
      body: "Lot started",
    });
  });

  it("includes sender avatar URL when present", () => {
    const row = {
      id: "m3",
      liveRoomId: "room-1",
      senderId: "u3",
      body: "hello",
      messageType: "chat" as const,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      sender: { username: "buyer1", image: "https://cdn.example/avatar.jpg" },
    };
    expect(serializeLiveRoomMessage(row)).toMatchObject({
      senderUsername: "buyer1",
      senderAvatarUrl: "https://cdn.example/avatar.jpg",
    });
  });
});
