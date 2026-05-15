import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getServerSessionSafe: vi.fn(),
  hostAccess: vi.fn(),
  liveRoomFindUnique: vi.fn(),
  provisionRoomStream: vi.fn(),
  rotateStreamKey: vi.fn(),
  stopStream: vi.fn(),
  syncLiveRoomStreamFromIvs: vi.fn(),
  reconcileStaleLiveStreamWithRoomStatus: vi.fn(),
  checkRateLimit: vi.fn(() => ({ ok: true as const, remaining: 29, resetAt: Date.now() + 60_000 })),
}));

vi.mock("next-auth", () => ({
  getServerSession: hoisted.getServerSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getServerSessionSafe: hoisted.getServerSessionSafe,
}));

vi.mock("@/lib/live-room-host-auth", () => ({
  getLiveRoomHostAccess: hoisted.hostAccess,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findUnique: hoisted.liveRoomFindUnique,
    },
  },
}));

vi.mock("@/lib/request-rate-limit", () => ({
  checkRateLimit: hoisted.checkRateLimit,
}));

vi.mock("@/lib/ivs-ops-log", () => ({
  logIvsOpsServer: vi.fn(),
}));

vi.mock("@/services/ivs", () => ({
  provisionRoomStream: hoisted.provisionRoomStream,
  rotateStreamKey: hoisted.rotateStreamKey,
  stopStream: hoisted.stopStream,
  syncLiveRoomStreamFromIvs: hoisted.syncLiveRoomStreamFromIvs,
  reconcileStaleLiveStreamWithRoomStatus: hoisted.reconcileStaleLiveStreamWithRoomStatus,
}));

import { GET as getStream } from "@/app/api/live-rooms/[id]/stream/route";
import { POST as provision } from "@/app/api/live-rooms/[id]/stream/provision/route";
import { POST as rotate } from "@/app/api/live-rooms/[id]/stream/rotate-key/route";
import { POST as stop } from "@/app/api/live-rooms/[id]/stream/stop/route";

function streamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "room_1",
    streamProvider: "aws_ivs",
    streamHealth: "offline",
    ivsPlaybackUrl: "https://playback.m3u8",
    ivsIngestEndpoint: "rtmps://ingest.global-contribute.live-video.net:443/app/",
    ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    ivsChannelName: "vaulted-live-room_1",
    ivsStreamKeyArn: "arn:aws:ivs:us-east-1:123:stream-key/abc",
    ivsStreamKeyCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    streamStartedAt: null,
    streamEndedAt: null,
    lastIvsStatusSyncAt: new Date("2026-01-01T00:00:00.000Z"),
    lastIvsError: null,
    ...overrides,
  };
}

describe("live room stream routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sellerSession = { user: { id: "seller_1" } };
    hoisted.liveRoomFindUnique.mockResolvedValue(streamRow());
    hoisted.getServerSession.mockResolvedValue(sellerSession);
    hoisted.getServerSessionSafe.mockResolvedValue(sellerSession);
    hoisted.hostAccess.mockResolvedValue({ ok: true, room: { id: "room_1", sellerId: "seller_1" }, isAdmin: false });
    hoisted.provisionRoomStream.mockResolvedValue({
      ingestEndpoint: "rtmps://ingest",
      streamKeyValue: "sk_live_secret",
    });
    hoisted.rotateStreamKey.mockResolvedValue({
      streamKeyValue: "sk_live_rotated",
    });
    hoisted.stopStream.mockResolvedValue(undefined);
    hoisted.syncLiveRoomStreamFromIvs.mockResolvedValue(null);
    hoisted.reconcileStaleLiveStreamWithRoomStatus.mockResolvedValue(null);
    hoisted.checkRateLimit.mockReturnValue({ ok: true as const, remaining: 29, resetAt: Date.now() + 60_000 });
  });

  it("host can provision stream", async () => {
    const res = await provision(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ingest?: { oneTimeStreamKey?: string } };
    expect(body.ingest?.oneTimeStreamKey).toBe("sk_live_secret");
    expect(hoisted.provisionRoomStream).toHaveBeenCalledWith("room_1");
  });

  it("buyer cannot provision stream", async () => {
    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await provision(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(403);
  });

  it("GET with sync=1 runs IVS sync for host", async () => {
    const res = await getStream(new Request("http://x/api/live-rooms/room_1/stream?sync=1"), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    expect(hoisted.syncLiveRoomStreamFromIvs).toHaveBeenCalledWith("room_1");
    expect(hoisted.reconcileStaleLiveStreamWithRoomStatus).toHaveBeenCalledWith("room_1");
    const body = (await res.json()) as { viewerRole?: string; stream?: Record<string, unknown> };
    expect(body.viewerRole).toBe("host");
    expect(typeof body.stream?.ingestEndpoint).toBe("string");
  });

  it("GET sync=1 is unauthorized without session", async () => {
    hoisted.getServerSession.mockResolvedValueOnce(null);
    hoisted.getServerSessionSafe.mockResolvedValueOnce(null);
    const res = await getStream(new Request("http://x/api/live-rooms/room_1/stream?sync=1"), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(401);
    expect(hoisted.syncLiveRoomStreamFromIvs).not.toHaveBeenCalled();
  });

  it("GET sync=1 is forbidden for non-host", async () => {
    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Only the room host or an admin can do this." });
    const res = await getStream(new Request("http://x/api/live-rooms/room_1/stream?sync=true"), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(403);
    expect(hoisted.syncLiveRoomStreamFromIvs).not.toHaveBeenCalled();
  });

  it("buyer cannot receive stream key", async () => {
    hoisted.getServerSession.mockResolvedValueOnce(null);
    hoisted.getServerSessionSafe.mockResolvedValueOnce(null);
    const res = await getStream(new Request("http://x"), { params: Promise.resolve({ id: "room_1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("oneTimeStreamKey");
    expect(serialized).not.toContain("streamKeyArn");
    expect(serialized).not.toContain("ingestEndpoint");
    expect(serialized).not.toContain("channelArn");
    expect(serialized).not.toContain("ivsChannelArn");
    const stream = body.stream as Record<string, unknown>;
    expect(Object.keys(stream).sort()).toEqual(
      ["lastStatusSyncAt", "playbackUrl", "roomId", "streamEndedAt", "streamHealth", "streamProvider", "streamStartedAt"].sort(),
    );
  });

  it("provision is idempotent through service call", async () => {
    await provision(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "room_1" }) });
    await provision(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "room_1" }) });
    expect(hoisted.provisionRoomStream).toHaveBeenCalledTimes(2);
  });

  it("rotate key is host-only", async () => {
    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const denied = await rotate(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "room_1" }) });
    expect(denied.status).toBe(403);

    const allowed = await rotate(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "room_1" }) });
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { ingest?: { oneTimeStreamKey?: string } };
    expect(body.ingest?.oneTimeStreamKey).toBe("sk_live_rotated");
  });

  it("stop is host-only", async () => {
    const res = await stop(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "room_1" }) });
    expect(res.status).toBe(200);
    expect(hoisted.stopStream).toHaveBeenCalledWith("room_1");
  });
});
