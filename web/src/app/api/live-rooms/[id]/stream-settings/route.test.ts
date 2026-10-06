import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireHostAccess: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/app/api/live-rooms/[id]/stream/_shared", () => ({ requireHostAccess: hoisted.requireHostAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: { liveRoom: { findUnique: hoisted.findUnique, update: hoisted.update } },
}));
vi.mock("@/lib/realtime-emit-server", () => ({ emitStreamStatusChanged: vi.fn() }));
vi.mock("@/services/ivs", () => ({
  cancelPausedBroadcastAwsTeardown: vi.fn(),
  ensureStageHlsCompositionActive: vi.fn(async () => undefined),
  schedulePausedBroadcastAwsTeardown: vi.fn(),
}));

import { PATCH } from "@/app/api/live-rooms/[id]/stream-settings/route";

const patch = (streamPaused: boolean) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ streamPaused }) }), {
    params: Promise.resolve({ id: "room_1" }),
  });

const liveRoom = (streamPaused: boolean) => ({
  status: "live",
  streamHealth: "live",
  streamPaused,
  roomVersion: 3,
  streamMode: "stage_webrtc",
});

describe("stream-settings pause timestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireHostAccess.mockResolvedValue({ ok: true, userId: "seller_1", access: { isAdmin: false } });
    hoisted.update.mockResolvedValue({ streamHealth: "live", streamPaused: true, roomVersion: 4 });
  });

  it("stamps streamPausedAt when the host pauses", async () => {
    hoisted.findUnique.mockResolvedValue(liveRoom(false));
    await patch(true);
    const data = hoisted.update.mock.calls[0][0].data;
    expect(data.streamPaused).toBe(true);
    expect(data.streamPausedAt).toBeInstanceOf(Date);
  });

  it("keeps the original pause time if the room is already paused", async () => {
    hoisted.findUnique.mockResolvedValue(liveRoom(true));
    await patch(true);
    const data = hoisted.update.mock.calls[0][0].data;
    expect("streamPausedAt" in data).toBe(false);
  });

  it("clears streamPausedAt when the host resumes", async () => {
    hoisted.findUnique.mockResolvedValue(liveRoom(true));
    hoisted.update.mockResolvedValue({ streamHealth: "live", streamPaused: false, roomVersion: 4 });
    await patch(false);
    const data = hoisted.update.mock.calls[0][0].data;
    expect(data.streamPaused).toBe(false);
    expect(data.streamPausedAt).toBeNull();
  });
});
