import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getServerSessionSafe: vi.fn(),
  hostAccess: vi.fn(),
  liveRoomFindUnique: vi.fn(),
  liveRoomUpdate: vi.fn(),
  provisionRoomStream: vi.fn(),
  prepareHostWebBroadcastSession: vi.fn(),
  endHostWebBroadcastSession: vi.fn(),
  rotateStreamKey: vi.fn(),
  stopStream: vi.fn(),
  syncLiveRoomStreamFromIvs: vi.fn(),
  reconcileStaleLiveStreamWithRoomStatus: vi.fn(),
  prepareHostStageSession: vi.fn(),
  createViewerStageToken: vi.fn(),
  endHostStageSession: vi.fn(),
  ensureStageHlsCompositionActive: vi.fn(),
  schedulePausedBroadcastAwsTeardown: vi.fn(),
  cancelPausedBroadcastAwsTeardown: vi.fn(),
  reconcileStagePublisherHealth: vi.fn(async () => "skip" as const),
  ensureChannelLowLatencyMode: vi.fn(async () => true),
  checkRateLimit: vi.fn(() => ({ ok: true as const, remaining: 29, resetAt: Date.now() + 60_000 })),
  userFindUnique: vi.fn(),
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
      update: hoisted.liveRoomUpdate,
    },
    user: {
      findUnique: hoisted.userFindUnique,
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
  prepareHostWebBroadcastSession: hoisted.prepareHostWebBroadcastSession,
  endHostWebBroadcastSession: hoisted.endHostWebBroadcastSession,
  rotateStreamKey: hoisted.rotateStreamKey,
  stopStream: hoisted.stopStream,
  syncLiveRoomStreamFromIvs: hoisted.syncLiveRoomStreamFromIvs,
  reconcileStaleLiveStreamWithRoomStatus: hoisted.reconcileStaleLiveStreamWithRoomStatus,
  prepareHostStageSession: hoisted.prepareHostStageSession,
  createViewerStageToken: hoisted.createViewerStageToken,
  endHostStageSession: hoisted.endHostStageSession,
  ensureStageHlsCompositionActive: hoisted.ensureStageHlsCompositionActive,
  schedulePausedBroadcastAwsTeardown: hoisted.schedulePausedBroadcastAwsTeardown,
  cancelPausedBroadcastAwsTeardown: hoisted.cancelPausedBroadcastAwsTeardown,
  reconcileStagePublisherHealth: hoisted.reconcileStagePublisherHealth,
  ensureChannelLowLatencyMode: hoisted.ensureChannelLowLatencyMode,
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitStreamStatusChanged: vi.fn(),
}));

import { POST as broadcastStart } from "@/app/api/live-rooms/[id]/stream/broadcast-start/route";
import { POST as broadcastStop } from "@/app/api/live-rooms/[id]/stream/broadcast-stop/route";
import { GET as getStream } from "@/app/api/live-rooms/[id]/stream/route";
import { POST as provision } from "@/app/api/live-rooms/[id]/stream/provision/route";
import { POST as rotate } from "@/app/api/live-rooms/[id]/stream/rotate-key/route";
import { POST as stop } from "@/app/api/live-rooms/[id]/stream/stop/route";
import {
  DELETE as stageTokenDelete,
  GET as stageTokenGet,
  POST as stageTokenPost,
} from "@/app/api/live-rooms/[id]/stream/stage-token/route";

function streamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "room_1",
    streamProvider: "aws_ivs",
    streamMode: "stage_webrtc",
    streamHealth: "offline",
    ivsPlaybackUrl: "https://playback.m3u8",
    ivsIngestEndpoint: "rtmps://ingest.global-contribute.live-video.net:443/app/",
    ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    ivsChannelName: "vaulted-live-room_1",
    ivsStreamKeyArn: "arn:aws:ivs:us-east-1:123:stream-key/abc",
    ivsStreamKeyCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
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
    hoisted.liveRoomUpdate.mockResolvedValue(streamRow({ streamMode: "channel_hls" }));
    hoisted.getServerSession.mockResolvedValue(sellerSession);
    hoisted.getServerSessionSafe.mockResolvedValue(sellerSession);
    hoisted.hostAccess.mockResolvedValue({ ok: true, room: { id: "room_1", sellerId: "seller_1" }, isAdmin: false });
    hoisted.provisionRoomStream.mockResolvedValue({
      ingestEndpoint: "rtmps://ingest",
      streamKeyValue: "sk_live_secret",
    });
    hoisted.prepareHostWebBroadcastSession.mockResolvedValue({
      roomId: "room_1",
      ingestEndpoint: "rtmps://ingest.global-contribute.live-video.net:443/app/",
      streamKeyValue: "sk_live_webcam",
      streamConfigPreset: "STANDARD_LANDSCAPE",
    });
    hoisted.endHostWebBroadcastSession.mockResolvedValue(undefined);
    hoisted.rotateStreamKey.mockResolvedValue({
      streamKeyValue: "sk_live_rotated",
    });
    hoisted.stopStream.mockResolvedValue(undefined);
    hoisted.syncLiveRoomStreamFromIvs.mockResolvedValue(null);
    hoisted.reconcileStaleLiveStreamWithRoomStatus.mockResolvedValue(null);
    hoisted.prepareHostStageSession.mockResolvedValue({
      token: "host_stage_token",
      participantId: "participant_host",
      stageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      expiresInSeconds: 3600,
    });
    hoisted.createViewerStageToken.mockResolvedValue({
      token: "viewer_stage_token",
      participantId: "participant_viewer",
      stageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      expiresInSeconds: 1200,
    });
    hoisted.endHostStageSession.mockResolvedValue(undefined);
    hoisted.ensureStageHlsCompositionActive.mockResolvedValue(undefined);
    hoisted.checkRateLimit.mockReturnValue({ ok: true as const, remaining: 29, resetAt: Date.now() + 60_000 });
    hoisted.userFindUnique.mockResolvedValue({
      id: "seller_1",
      accountDeletedAt: null,
      suspendedAt: null,
    });
  });

  it("host can provision stream", async () => {
    const res = await provision(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ingest?: { oneTimeStreamKey?: string; endpoint?: string };
    };
    expect(body.ingest?.oneTimeStreamKey).toBe("sk_live_secret");
    expect(body.ingest?.endpoint).toBe("rtmps://ingest:443/app/");
    expect(hoisted.provisionRoomStream).toHaveBeenCalledWith("room_1");
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room_1" },
        data: { streamMode: "channel_hls" },
      }),
    );
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

  it("buyer GET for channel_hls runs throttled IVS health sync", async () => {
    hoisted.liveRoomFindUnique
      .mockResolvedValueOnce(
        streamRow({
          streamMode: "channel_hls",
          streamHealth: "offline",
          lastIvsStatusSyncAt: null,
        }),
      )
      .mockResolvedValueOnce(
        streamRow({
          streamMode: "channel_hls",
          streamHealth: "live",
        }),
      );
    const res = await getStream(new Request("http://x/api/live-rooms/room_1/stream"), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    expect(hoisted.syncLiveRoomStreamFromIvs).toHaveBeenCalledWith("room_1");
    const body = (await res.json()) as { stream?: { streamHealth?: string } };
    expect(body.stream?.streamHealth).toBe("live");
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
      [
        "lastStatusSyncAt",
        "latencyMode",
        "playbackUrl",
        "roomId",
        "stageAvailable",
        "streamEndedAt",
        "streamHealth",
        "streamMode",
        "streamProvider",
        "streamStartedAt",
      ].sort(),
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

  it("broadcast-start returns host-only ingest credentials", async () => {
    const res = await broadcastStart(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      broadcast?: { streamKey?: string; ingestEndpoint?: string; streamConfigPreset?: string };
    };
    expect(body.broadcast?.streamKey).toBe("sk_live_webcam");
    expect(body.broadcast?.ingestEndpoint).toContain("rtmps://");
    expect(body.broadcast?.streamConfigPreset).toBe("STANDARD_LANDSCAPE");
    expect(hoisted.prepareHostWebBroadcastSession).toHaveBeenCalledWith("room_1");
  });

  it("broadcast-start is forbidden for non-host", async () => {
    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await broadcastStart(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(403);
    expect(hoisted.prepareHostWebBroadcastSession).not.toHaveBeenCalled();
  });

  it("broadcast-stop rotates key via service", async () => {
    const res = await broadcastStop(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    expect(hoisted.endHostWebBroadcastSession).toHaveBeenCalledWith("room_1");
  });

  it("buyer GET cannot receive broadcast stream key fields", async () => {
    hoisted.getServerSession.mockResolvedValueOnce(null);
    hoisted.getServerSessionSafe.mockResolvedValueOnce(null);
    const res = await getStream(new Request("http://x"), { params: Promise.resolve({ id: "room_1" }) });
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("sk_live");
    expect(serialized).not.toContain("streamKey");
  });

  it("stage-token POST returns a host publish token", async () => {
    const res = await stageTokenPost(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage?: { token?: string; participantId?: string } };
    expect(body.stage?.token).toBe("host_stage_token");
    expect(hoisted.prepareHostStageSession).toHaveBeenCalledWith("room_1", "seller_1");
  });

  it("stage-token POST is forbidden for non-host", async () => {
    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await stageTokenPost(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(res.status).toBe(403);
    expect(hoisted.prepareHostStageSession).not.toHaveBeenCalled();
  });

  it("stage-token GET returns a subscribe-only viewer token", async () => {
    const res = await stageTokenGet(new Request("http://x"), { params: Promise.resolve({ id: "room_1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage?: { token?: string } };
    expect(body.stage?.token).toBe("viewer_stage_token");
    expect(hoisted.createViewerStageToken).toHaveBeenCalledWith("room_1", "seller_1");
    // Viewer token path must never mint a host/publish session.
    expect(hoisted.prepareHostStageSession).not.toHaveBeenCalled();
  });

  it("stage-token GET is unauthorized for guests", async () => {
    hoisted.getServerSession.mockResolvedValueOnce(null);
    hoisted.getServerSessionSafe.mockResolvedValueOnce(null);
    const res = await stageTokenGet(new Request("http://x"), { params: Promise.resolve({ id: "room_1" }) });
    expect(res.status).toBe(401);
    expect(hoisted.createViewerStageToken).not.toHaveBeenCalled();
  });

  it("stage-token GET returns 409 when the room has no stage", async () => {
    hoisted.liveRoomFindUnique.mockResolvedValueOnce(streamRow({ ivsStageArn: null }));
    const res = await stageTokenGet(new Request("http://x"), { params: Promise.resolve({ id: "room_1" }) });
    expect(res.status).toBe(409);
    expect(hoisted.createViewerStageToken).not.toHaveBeenCalled();
  });

  it("stage-token DELETE ends the host stage session (host-only)", async () => {
    const denied = await stageTokenDelete(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "room_1" }),
    });
    expect(denied.status).toBe(200);
    expect(hoisted.endHostStageSession).toHaveBeenCalledWith("room_1");

    hoisted.hostAccess.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const forbidden = await stageTokenDelete(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "room_2" }),
    });
    expect(forbidden.status).toBe(403);
  });
});
