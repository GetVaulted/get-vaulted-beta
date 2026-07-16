import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChannel, mapIvsStatusToRoomHealth, normalizeExternalIvsStateToken } from "@/services/ivs";

const hoisted = vi.hoisted(() => ({
  liveRoomFindUnique: vi.fn(),
  liveRoomUpdate: vi.fn(),
  compositionSend: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findUnique: hoisted.liveRoomFindUnique,
      update: hoisted.liveRoomUpdate,
    },
  },
}));

vi.mock("@aws-sdk/client-ivs-realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-ivs-realtime")>();
  return {
    ...actual,
    IVSRealTimeClient: vi.fn().mockImplementation(() => ({ send: hoisted.compositionSend })),
  };
});

describe("ivs service", () => {
  it("maps stream states to room health", () => {
    expect(mapIvsStatusToRoomHealth("LIVE")).toBe("live");
    expect(mapIvsStatusToRoomHealth("OFFLINE")).toBe("offline");
    expect(mapIvsStatusToRoomHealth("CONNECTING")).toBe("connecting");
    expect(mapIvsStatusToRoomHealth("ENDED")).toBe("ended");
    expect(mapIvsStatusToRoomHealth("UNKNOWN")).toBe("error");
  });

  it("normalizes external / EventBridge-style state tokens", () => {
    expect(normalizeExternalIvsStateToken("stream-live")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("PENDING")).toBe("CONNECTING");
    expect(normalizeExternalIvsStateToken("ACTIVE")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("BROADCASTING")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("idle")).toBe("OFFLINE");
    expect(normalizeExternalIvsStateToken("stream-error")).toBe("UNKNOWN");
    expect(mapIvsStatusToRoomHealth(normalizeExternalIvsStateToken("STARTING"))).toBe("connecting");
  });

  it("returns clean error when AWS env is missing", async () => {
    const oldRegion = process.env.AWS_REGION;
    const oldVaultedRegion = process.env.VAULTED_AWS_REGION;
    const oldAccess = process.env.AWS_ACCESS_KEY_ID;
    const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;
    const oldVaultedAccess = process.env.VAULTED_AWS_ACCESS_KEY_ID;
    const oldVaultedSecret = process.env.VAULTED_AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    delete process.env.VAULTED_AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.VAULTED_AWS_ACCESS_KEY_ID;
    delete process.env.VAULTED_AWS_SECRET_ACCESS_KEY;

    await expect(createChannel("room_1")).rejects.toThrow(
      "AWS IVS is not configured. Set VAULTED_AWS_REGION (or AWS_REGION), VAULTED_AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID), and VAULTED_AWS_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY).",
    );

    process.env.AWS_REGION = oldRegion;
    process.env.VAULTED_AWS_REGION = oldVaultedRegion;
    process.env.AWS_ACCESS_KEY_ID = oldAccess;
    process.env.AWS_SECRET_ACCESS_KEY = oldSecret;
    process.env.VAULTED_AWS_ACCESS_KEY_ID = oldVaultedAccess;
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY = oldVaultedSecret;
  });
});

describe("stage HLS composition (guest HLS mirror)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAULTED_AWS_REGION = "us-east-1";
    process.env.VAULTED_AWS_ACCESS_KEY_ID = "AKIA_TEST";
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY = "secret_test";
    hoisted.liveRoomUpdate.mockResolvedValue({});
  });

  it("ensureStageHlsCompositionActive no-ops when a mirror is already active", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      streamMode: "stage_webrtc",
      streamHealth: "live",
      ivsCompositionArn: "arn:aws:ivs:us-east-1:123:composition/existing",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).not.toHaveBeenCalled();
  });

  it("ensureStageHlsCompositionActive no-ops for non-stage broadcasts", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      streamMode: "channel_hls",
      streamHealth: "live",
      ivsCompositionArn: null,
      ivsStageArn: null,
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).not.toHaveBeenCalled();
  });

  it("ensureStageHlsCompositionActive retries a missing mirror while the room is live", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      streamMode: "stage_webrtc",
      streamHealth: "live",
      ivsCompositionArn: null,
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    });
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
      ivsCompositionArn: null,
    });
    hoisted.compositionSend.mockResolvedValueOnce({
      composition: { arn: "arn:aws:ivs:us-east-1:123:composition/new" },
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).toHaveBeenCalledTimes(1);
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { ivsCompositionArn: "arn:aws:ivs:us-east-1:123:composition/new", lastIvsError: null },
    });
  });

  it("startStageHlsComposition never throws and persists lastIvsError once retries are exhausted", async () => {
    const { startStageHlsComposition } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
      ivsCompositionArn: null,
    });
    hoisted.compositionSend.mockRejectedValue(new Error("AccessDeniedException"));

    await expect(startStageHlsComposition("room_1")).resolves.toBeNull();

    expect(hoisted.compositionSend).toHaveBeenCalledTimes(4);
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { lastIvsError: "stage_composition_start_failed: AccessDeniedException" },
    });
  }, 25_000);
});
