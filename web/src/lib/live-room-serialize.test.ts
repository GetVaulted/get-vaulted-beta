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

  it("masks deleted chat bodies", () => {
    const row = {
      id: "m2",
      liveRoomId: "room-1",
      senderId: "u2",
      body: "toxic text",
      messageType: "chat" as const,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      deletedAt: new Date("2026-05-22T12:01:00.000Z"),
      sender: { username: "buyer1" },
    };
    expect(serializeLiveRoomMessage(row)).toMatchObject({
      senderUsername: "buyer1",
      body: "[message removed]",
    });
  });
});
