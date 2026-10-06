import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: {
    liveRoom: { findUnique: vi.fn() },
    liveRoomMessage: { findFirst: vi.fn(), create: vi.fn() },
    liveRoomModerationAction: { findMany: vi.fn() },
    sellerStreamBan: { findFirst: vi.fn() },
    liveRoomModerator: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  auth: vi.fn(),
  emit: vi.fn(),
  mentions: vi.fn(),
  loadMentionsForSource: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/live-room-chat-auth", () => ({ resolveChatSenderId: hoisted.auth }));
vi.mock("@/lib/resolve-live-rooms-auth", () => ({ resolveOptionalLiveRoomsUserId: vi.fn() }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveRoomMessageDtoAndWait: hoisted.emit }));
vi.mock("@/lib/mentions/process-message-mentions", () => ({ processMessageMentions: hoisted.mentions }));
vi.mock("@/lib/mentions/load-message-mentions", () => ({
  loadMentionsForSource: hoisted.loadMentionsForSource,
  loadMentionsForSources: vi.fn(),
}));

import { POST } from "./route";

const ROOM = { id: "room1", status: "live", sellerId: "host1", slowModeSeconds: 0 };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    liveRoomId: "room1",
    senderId: "buyer1",
    body: "hello",
    messageType: "chat",
    createdAt: new Date("2026-10-05T12:00:00Z"),
    deletedAt: null,
    sender: { username: "amy", image: null },
    ...over,
  };
}

const post = (body: unknown) =>
  POST(
    new Request("https://x.test/api/live-rooms/room1/messages", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "room1" }) },
  );

describe("POST /api/live-rooms/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.auth.mockResolvedValue({ userId: "buyer1" });
    hoisted.prisma.liveRoom.findUnique.mockResolvedValue(ROOM);
    hoisted.prisma.liveRoomModerationAction.findMany.mockResolvedValue([]);
    hoisted.prisma.sellerStreamBan.findFirst.mockResolvedValue(null);
    hoisted.prisma.liveRoomModerator.findFirst.mockResolvedValue(null);
    hoisted.prisma.liveRoomMessage.findFirst.mockResolvedValue(null);
    hoisted.prisma.liveRoomMessage.create.mockImplementation(async ({ data }: { data: { body: string } }) =>
      row({ body: data.body }),
    );
    hoisted.emit.mockResolvedValue(undefined);
    hoisted.mentions.mockResolvedValue([]);
    hoisted.loadMentionsForSource.mockResolvedValue([]);
  });

  it("sends, and broadcasts the row it just wrote without re-reading it", async () => {
    const res = await post({ body: "hello" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.message).toMatchObject({ id: "m1", body: "hello", senderUsername: "amy" });
    expect(hoisted.emit).toHaveBeenCalledTimes(1);
    expect(hoisted.emit).toHaveBeenCalledWith("room1", expect.objectContaining({ id: "m1", body: "hello", mentions: [] }));
    // No second read of the message, and no separate sender lookup.
    expect(hoisted.prisma.liveRoomMessage.create).toHaveBeenCalledTimes(1);
    expect(hoisted.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(hoisted.mentions).not.toHaveBeenCalled();
  });

  it("reads the room exactly once for the whole send", async () => {
    await post({ body: "hello" });
    expect(hoisted.prisma.liveRoom.findUnique).toHaveBeenCalledTimes(1);
  });

  it("finishes the broadcast before it responds", async () => {
    let delivered = false;
    hoisted.emit.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      delivered = true;
    });
    await post({ body: "hello" });
    expect(delivered).toBe(true);
  });

  it("still succeeds when the broadcast fails", async () => {
    hoisted.emit.mockRejectedValue(new Error("realtime down"));
    const res = await post({ body: "hello" });
    expect(res.status).toBe(200);
  });

  it("does not hold the sender's request open for a hung broadcast", async () => {
    vi.useFakeTimers();
    try {
      hoisted.emit.mockImplementation(() => new Promise(() => {}));
      const pending = post({ body: "hello" });
      await vi.advanceTimersByTimeAsync(3000);
      const res = await pending;
      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts @mentions on the broadcast", async () => {
    hoisted.mentions.mockResolvedValue([{ userId: "u2", username: "ben" }]);
    await post({ body: "hi @ben" });
    expect(hoisted.mentions).toHaveBeenCalledTimes(1);
    expect(hoisted.emit).toHaveBeenCalledWith(
      "room1",
      expect.objectContaining({ mentions: [{ userId: "u2", username: "ben" }] }),
    );
  });

  it("does not process mentions for staff chat", async () => {
    hoisted.prisma.liveRoomModerator.findFirst.mockResolvedValue({ moderatorLevel: "show" });
    hoisted.prisma.liveRoomMessage.create.mockImplementation(async ({ data }: { data: { body: string } }) =>
      row({ body: data.body, messageType: "staff" }),
    );
    const res = await post({ body: "psst @ben", staffOnly: true });
    expect(res.status).toBe(200);
    expect(hoisted.mentions).not.toHaveBeenCalled();
    expect(hoisted.emit).toHaveBeenCalledWith("room1", expect.objectContaining({ messageType: "staff" }));
  });

  it("returns the earlier message for a repeated send within the duplicate window", async () => {
    hoisted.prisma.liveRoomMessage.findFirst.mockResolvedValue(row({ id: "m0" }));
    const res = await post({ body: "hello" });
    expect((await res.json()).message.id).toBe("m0");
    expect(hoisted.prisma.liveRoomMessage.create).not.toHaveBeenCalled();
    expect(hoisted.emit).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated sender", async () => {
    hoisted.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await post({ body: "hello" })).status).toBe(401);
    expect(hoisted.prisma.liveRoomMessage.create).not.toHaveBeenCalled();
  });

  it("rejects chat in an ended room and a missing room", async () => {
    hoisted.prisma.liveRoom.findUnique.mockResolvedValue({ ...ROOM, status: "ended" });
    expect((await post({ body: "hello" })).status).toBe(409);
    hoisted.prisma.liveRoom.findUnique.mockResolvedValue(null);
    expect((await post({ body: "hello" })).status).toBe(404);
  });

  it("blocks a muted user, a banned user and a kicked user", async () => {
    hoisted.prisma.liveRoomModerationAction.findMany.mockResolvedValue([
      { actionType: "mute", expiresAt: null, createdAt: new Date() },
    ]);
    const muted = await post({ body: "hello" });
    expect(muted.status).toBe(403);
    expect((await muted.json()).error).toMatch(/muted/i);

    hoisted.prisma.liveRoomModerationAction.findMany.mockResolvedValue([
      { actionType: "room_ban", expiresAt: null, createdAt: new Date() },
    ]);
    expect((await post({ body: "hello" })).status).toBe(403);
    expect(hoisted.prisma.liveRoomMessage.create).not.toHaveBeenCalled();
  });

  it("blocks a stream-banned user", async () => {
    hoisted.prisma.sellerStreamBan.findFirst.mockResolvedValue({ id: "ban1" });
    expect((await post({ body: "hello" })).status).toBe(403);
  });

  it("only lets the host or a moderator send staff chat", async () => {
    const res = await post({ body: "hello", staffOnly: true });
    expect(res.status).toBe(403);
    expect(hoisted.prisma.liveRoomMessage.create).not.toHaveBeenCalled();
  });

  it("applies slow mode to buyers but not to the host", async () => {
    hoisted.prisma.liveRoom.findUnique.mockResolvedValue({ ...ROOM, slowModeSeconds: 30 });
    hoisted.prisma.liveRoomMessage.findFirst.mockImplementation(async (args: { where: { body?: string } }) =>
      args.where.body ? null : { createdAt: new Date(Date.now() - 5000) },
    );
    const slow = await post({ body: "hello" });
    expect(slow.status).toBe(429);
    expect((await slow.json()).error).toMatch(/slow mode/i);

    hoisted.auth.mockResolvedValue({ userId: "host1" });
    const host = await post({ body: "hello" });
    expect(host.status).toBe(200);
  });

  it("rejects an empty message and invalid JSON", async () => {
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });

  it("reports a failed insert and does not broadcast", async () => {
    hoisted.prisma.liveRoomMessage.create.mockRejectedValue(new Error("db down"));
    const res = await post({ body: "hello" });
    expect(res.status).toBe(500);
    expect(hoisted.emit).not.toHaveBeenCalled();
  });
});
