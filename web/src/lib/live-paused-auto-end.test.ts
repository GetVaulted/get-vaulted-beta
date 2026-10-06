import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  userFindUnique: vi.fn(),
  autoEndRoom: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: { findMany: hoisted.findMany, updateMany: hoisted.updateMany },
    user: { findUnique: hoisted.userFindUnique },
  },
}));
vi.mock("@/lib/live-stuck-recovery-service", () => ({ autoEndRoom: hoisted.autoEndRoom }));
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins: hoisted.notify }));
vi.mock("@/lib/ivs-ops-log", () => ({ logIvsOpsServer: vi.fn() }));

import {
  PAUSED_AUTO_END_DEFAULT_MINUTES,
  decidePausedRoom,
  endLongPausedLiveRooms,
  pausedAutoEndMinutes,
} from "@/lib/live-paused-auto-end";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const room = (over: Record<string, unknown> = {}) => ({
  id: "room_1",
  title: "Box Run",
  sellerId: "seller_1",
  streamPaused: true,
  streamPausedAt: minAgo(61),
  completedSalesGmvUsd: 120,
  ...over,
});

describe("decidePausedRoom", () => {
  const base = { nowMs: NOW.getTime(), thresholdMs: 60 * 60_000 };
  it("ignores rooms that are not paused", () => {
    expect(decidePausedRoom({ ...base, streamPaused: false, streamPausedAt: minAgo(999) })).toBe("ignore");
  });
  it("starts the clock when paused without a timestamp", () => {
    expect(decidePausedRoom({ ...base, streamPaused: true, streamPausedAt: null })).toBe("start_clock");
  });
  it("waits until the threshold, then ends", () => {
    expect(decidePausedRoom({ ...base, streamPaused: true, streamPausedAt: minAgo(59) })).toBe("ignore");
    expect(decidePausedRoom({ ...base, streamPaused: true, streamPausedAt: minAgo(60) })).toBe("end");
    expect(decidePausedRoom({ ...base, streamPaused: true, streamPausedAt: minAgo(300) })).toBe("end");
  });
});

describe("pausedAutoEndMinutes", () => {
  afterEach(() => {
    delete process.env.LIVE_PAUSED_AUTO_END_MINUTES;
  });
  it("defaults to 60 and accepts a valid override", () => {
    expect(pausedAutoEndMinutes()).toBe(PAUSED_AUTO_END_DEFAULT_MINUTES);
    process.env.LIVE_PAUSED_AUTO_END_MINUTES = "90";
    expect(pausedAutoEndMinutes()).toBe(90);
    process.env.LIVE_PAUSED_AUTO_END_MINUTES = "nonsense";
    expect(pausedAutoEndMinutes()).toBe(60);
  });
});

describe("endLongPausedLiveRooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updateMany.mockResolvedValue({ count: 1 });
    hoisted.autoEndRoom.mockResolvedValue(true);
    hoisted.userFindUnique.mockResolvedValue({ username: "locdown" });
  });
  afterEach(() => {
    delete process.env.LIVE_PAUSED_AUTO_END_ENABLED;
  });

  it("ends a show paused for over an hour and alerts admins once", async () => {
    hoisted.findMany.mockResolvedValue([room()]);
    const s = await endLongPausedLiveRooms(NOW);
    expect(hoisted.autoEndRoom).toHaveBeenCalledWith("room_1", 120);
    expect(s).toMatchObject({ scanned: 1, ended: 1, endedRoomIds: ["room_1"] });
    expect(hoisted.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_live_paused_auto_end",
        title: "Paused show ended · @locdown",
        dedupeKey: "admin_live_paused_auto_end:room_1",
      }),
    );
  });

  it("leaves a show alone that has only been paused 30 minutes", async () => {
    hoisted.findMany.mockResolvedValue([room({ streamPausedAt: minAgo(30) })]);
    const s = await endLongPausedLiveRooms(NOW);
    expect(hoisted.autoEndRoom).not.toHaveBeenCalled();
    expect(s.ended).toBe(0);
  });

  it("starts the clock for a paused room with no timestamp instead of ending it", async () => {
    hoisted.findMany.mockResolvedValue([room({ streamPausedAt: null })]);
    const s = await endLongPausedLiveRooms(NOW);
    expect(hoisted.autoEndRoom).not.toHaveBeenCalled();
    expect(hoisted.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "room_1", streamPaused: true, streamPausedAt: null }),
        data: { streamPausedAt: NOW },
      }),
    );
    expect(s.clocksStarted).toBe(1);
  });

  it("only queries live, paused rooms", async () => {
    hoisted.findMany.mockResolvedValue([]);
    await endLongPausedLiveRooms(NOW);
    expect(hoisted.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "live", streamPaused: true } }),
    );
  });

  it("does not alert when the room was already ended by something else", async () => {
    hoisted.findMany.mockResolvedValue([room()]);
    hoisted.autoEndRoom.mockResolvedValue(false);
    const s = await endLongPausedLiveRooms(NOW);
    expect(s.ended).toBe(0);
    expect(hoisted.notify).not.toHaveBeenCalled();
  });

  it("keeps sweeping when one room fails", async () => {
    hoisted.findMany.mockResolvedValue([room({ id: "a" }), room({ id: "b" })]);
    hoisted.autoEndRoom.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await endLongPausedLiveRooms(NOW);
    spy.mockRestore();
    expect(s.endedRoomIds).toEqual(["b"]);
  });

  it("does nothing when the kill switch is off", async () => {
    process.env.LIVE_PAUSED_AUTO_END_ENABLED = "false";
    const s = await endLongPausedLiveRooms(NOW);
    expect(hoisted.findMany).not.toHaveBeenCalled();
    expect(s.scanned).toBe(0);
  });
});
