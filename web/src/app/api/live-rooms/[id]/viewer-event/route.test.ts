import { beforeEach, describe, expect, it, vi } from "vitest";

// Big shows: a persisted "joined" chat line per viewer is a DB read + write plus a broadcast to everyone.
// Above the big-room threshold the route answers with a non-persisted message instead (older app builds
// expect a message back) and never writes or broadcasts.

const hoisted = vi.hoisted(() => ({
  resolveLiveRoomsUserId: vi.fn(),
  roomFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  emitLiveRoomMessageDto: vi.fn(),
  resumeOpenGiveawayPresence: vi.fn().mockResolvedValue({ resumed: 0 }),
  pauseOpenGiveawayPresence: vi.fn().mockResolvedValue({ paused: 0 }),
  getLiveRoomUserRestrictions: vi.fn().mockResolvedValue({ roomBanned: false, kickedUntil: null, sellerStreamBanned: false }),
}));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({ resolveLiveRoomsUserId: hoisted.resolveLiveRoomsUserId }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: { findUnique: hoisted.roomFindUnique },
    user: { findUnique: hoisted.userFindUnique },
    liveRoomMessage: { findFirst: hoisted.messageFindFirst, create: hoisted.messageCreate },
  },
}));
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveRoomMessageDto: hoisted.emitLiveRoomMessageDto }));
vi.mock("@/lib/live-giveaway", () => ({
  resumeOpenGiveawayPresence: hoisted.resumeOpenGiveawayPresence,
  pauseOpenGiveawayPresence: hoisted.pauseOpenGiveawayPresence,
}));
vi.mock("@/lib/trust/live-room-moderation", () => ({
  getLiveRoomUserRestrictions: hoisted.getLiveRoomUserRestrictions,
}));

import { POST } from "./route";

function call(kind: string) {
  const req = new Request("http://test/api", { method: "POST", body: JSON.stringify({ kind }) });
  return POST(req, { params: Promise.resolve({ id: "room-1" }) });
}

describe("POST /api/live-rooms/[id]/viewer-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveLiveRoomsUserId.mockResolvedValue({ userId: "viewer-1" });
    hoisted.userFindUnique.mockResolvedValue({ username: "casey", image: null });
    hoisted.getLiveRoomUserRestrictions.mockResolvedValue({ roomBanned: false, kickedUntil: null, sellerStreamBanned: false });
    hoisted.messageFindFirst.mockResolvedValue(null);
    hoisted.messageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "m1",
      createdAt: new Date(),
      deletedAt: null,
      sender: { username: "casey", image: null },
      ...data,
    }));
  });

  it("small room: persists and broadcasts the join line as before", async () => {
    hoisted.roomFindUnique.mockResolvedValue({
      id: "room-1",
      status: "live",
      viewerCount: 40,
      viewerCountUpdatedAt: new Date(),
    });
    const res = await call("join");
    expect(res.status).toBe(200);
    expect(hoisted.messageCreate).toHaveBeenCalledTimes(1);
    expect(hoisted.emitLiveRoomMessageDto).toHaveBeenCalledTimes(1);
  });

  it("big room: no write, no broadcast, but still answers with a message and keeps giveaway presence", async () => {
    hoisted.roomFindUnique.mockResolvedValue({
      id: "room-1",
      status: "live",
      viewerCount: 1200,
      viewerCountUpdatedAt: new Date(),
    });
    const res = await call("join");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(json.message.id).toBe("skipped:join:room-1:viewer-1");
    expect(json.message.senderUsername).toBe("casey");
    expect(hoisted.messageCreate).not.toHaveBeenCalled();
    expect(hoisted.messageFindFirst).not.toHaveBeenCalled();
    expect(hoisted.emitLiveRoomMessageDto).not.toHaveBeenCalled();
    expect(hoisted.resumeOpenGiveawayPresence).toHaveBeenCalledWith("room-1", "viewer-1");
  });

  it("a stale big count (host gone) does not suppress join lines", async () => {
    hoisted.roomFindUnique.mockResolvedValue({
      id: "room-1",
      status: "live",
      viewerCount: 1200,
      viewerCountUpdatedAt: new Date(Date.now() - 10 * 60_000),
    });
    await call("join");
    expect(hoisted.messageCreate).toHaveBeenCalledTimes(1);
  });

  it("leave still pauses giveaway presence in a big room", async () => {
    hoisted.roomFindUnique.mockResolvedValue({
      id: "room-1",
      status: "live",
      viewerCount: 1200,
      viewerCountUpdatedAt: new Date(),
    });
    const res = await call("leave");
    expect(res.status).toBe(200);
    expect(hoisted.pauseOpenGiveawayPresence).toHaveBeenCalledWith("room-1", "viewer-1");
  });
});
