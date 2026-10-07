import { beforeEach, describe, expect, it, vi } from "vitest";

// Big shows: every viewer used to POST the same count every few seconds, each costing two queries and
// a write to one shared LiveRoom row. The route now throttles per room and uses a single update.

const hoisted = vi.hoisted(() => ({
  resolveLiveRoomsUserId: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({
  resolveLiveRoomsUserId: hoisted.resolveLiveRoomsUserId,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { liveRoom: { updateMany: hoisted.updateMany, findUnique: hoisted.findUnique } },
}));

import { POST } from "./route";

function call(roomId: string, viewerCount: unknown) {
  const req = new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify({ viewerCount }),
  });
  return POST(req, { params: Promise.resolve({ id: roomId }) });
}

describe("POST /api/live-rooms/[id]/viewer-count", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    hoisted.resolveLiveRoomsUserId.mockReset().mockResolvedValue({ userId: "u1" });
    hoisted.updateMany.mockReset().mockResolvedValue({ count: 1 });
    hoisted.findUnique.mockReset();
  });

  it("writes the count with a single update query", async () => {
    const res = await call("room-single", 1234);
    expect(res.status).toBe(200);
    expect(hoisted.updateMany).toHaveBeenCalledTimes(1);
    expect(hoisted.findUnique).not.toHaveBeenCalled();
    expect(hoisted.updateMany.mock.calls[0][0].data.viewerCount).toBe(1234);
    expect(hoisted.updateMany.mock.calls[0][0].where).toEqual({ id: "room-single", status: { not: "ended" } });
  });

  it("acknowledges but skips repeated writes for the same room inside the throttle window", async () => {
    await call("room-throttle", 100);
    const second = await call("room-throttle", 101);
    const third = await call("room-throttle", 102);
    expect(hoisted.updateMany).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
    expect((await third.json()).throttled).toBe(true);

    vi.setSystemTime(new Date("2026-10-07T12:00:04Z"));
    await call("room-throttle", 103);
    expect(hoisted.updateMany).toHaveBeenCalledTimes(2);
  });

  it("throttles each room independently", async () => {
    await call("room-a", 10);
    await call("room-b", 20);
    expect(hoisted.updateMany).toHaveBeenCalledTimes(2);
  });

  it("clamps absurd counts", async () => {
    await call("room-clamp", 9_999_999);
    expect(hoisted.updateMany.mock.calls[0][0].data.viewerCount).toBe(100_000);
  });

  it("explains a miss: 404 when the room does not exist, 409 when it ended", async () => {
    hoisted.updateMany.mockResolvedValue({ count: 0 });
    hoisted.findUnique.mockResolvedValueOnce(null);
    expect((await call("room-missing", 5)).status).toBe(404);
    hoisted.findUnique.mockResolvedValueOnce({ id: "room-ended", status: "ended" });
    expect((await call("room-ended", 5)).status).toBe(409);
  });

  it("rejects non-numeric counts before touching the database", async () => {
    const res = await call("room-bad", "lots");
    expect(res.status).toBe(400);
    expect(hoisted.updateMany).not.toHaveBeenCalled();
  });
});
