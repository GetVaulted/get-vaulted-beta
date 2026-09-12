import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChannel, mapIvsStatusToRoomHealth, normalizeExternalIvsStateToken } from "@/services/ivs";

const hoisted = vi.hoisted(() => ({
  liveRoomFindUnique: vi.fn(),
  liveRoomUpdate: vi.fn(),
  compositionSend: vi.fn(),
  channelSend: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findUnique: hoisted.liveRoomFindUnique,
      update: hoisted.liveRoomUpdate,
    },
  },
}));

vi.mock("@aws-sdk/client-ivs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-ivs")>();
  return {
    ...actual,
    IvsClient: vi.fn().mockImplementation(() => ({ send: hoisted.channelSend })),
  };
});

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

  it("ensureStageHlsCompositionActive leaves an ACTIVE mirror alone (anti-thrash)", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "stage_webrtc",
      streamHealth: "live",
      streamPaused: false,
      ivsCompositionArn: "arn:aws:ivs:us-east-1:123:composition/existing",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
      streamStartedAt: new Date(Date.now() - 60_000),
    });
    // GetStream probe fails (not ChannelNotBroadcasting) → composition state decides heal.
    hoisted.channelSend.mockRejectedValueOnce({ name: "ThrottlingException" });
    // GetComposition probe reports the mirror still ACTIVE → it must not be stopped/restarted.
    hoisted.compositionSend.mockResolvedValueOnce({
      composition: { state: "ACTIVE", destinations: [{ state: "ACTIVE" }] },
    });
    await ensureStageHlsCompositionActive("room_1");
    // Only the single GetComposition probe ran — no StopComposition/StartComposition thrash.
    expect(hoisted.compositionSend).toHaveBeenCalledTimes(1);
  });

  it("ensureStageHlsCompositionActive no-ops while the host stream is paused", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "stage_webrtc",
      streamHealth: "live",
      streamPaused: true,
      ivsCompositionArn: null,
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
      streamStartedAt: new Date(Date.now() - 60_000),
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).not.toHaveBeenCalled();
  });

  it("ensureStageHlsCompositionActive no-ops for non-stage broadcasts", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "channel_hls",
      streamHealth: "live",
      streamPaused: false,
      ivsCompositionArn: null,
      ivsStageArn: null,
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).not.toHaveBeenCalled();
  });

  it("ensureStageHlsCompositionActive retries a missing mirror while streamHealth is offline", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "stage_webrtc",
      streamHealth: "offline",
      streamPaused: false,
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
      composition: { arn: "arn:aws:ivs:us-east-1:123:composition/offline-heal" },
    });
    await ensureStageHlsCompositionActive("room_1");
    expect(hoisted.compositionSend).toHaveBeenCalledTimes(1);
  });

  it("ensureStageHlsCompositionActive retries a missing mirror while the room is live", async () => {
    const { ensureStageHlsCompositionActive } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "stage_webrtc",
      streamHealth: "live",
      streamPaused: false,
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

    // Retry schedule is [0, 2s, 5s, 10s, 15s] → 5 attempts before giving up.
    expect(hoisted.compositionSend).toHaveBeenCalledTimes(5);
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { lastIvsError: "stage_composition_start_failed: AccessDeniedException" },
    });
  }, 45_000);

  it("cutLiveBroadcastAwsBilling stops composition + channel ingest while paused without ending the room", async () => {
    const { cutLiveBroadcastAwsBilling } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique
      .mockResolvedValueOnce({
        status: "live",
        streamPaused: true,
        streamMode: "stage_webrtc",
        ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
        ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
      })
      .mockResolvedValueOnce({
        ivsCompositionArn: "arn:aws:ivs:us-east-1:123:composition/existing",
      });
    hoisted.compositionSend.mockResolvedValueOnce({});
    hoisted.channelSend.mockResolvedValueOnce({});

    await cutLiveBroadcastAwsBilling("room_1");

    expect(hoisted.compositionSend).toHaveBeenCalledTimes(1);
    expect(hoisted.channelSend).toHaveBeenCalledTimes(1);
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { ivsCompositionArn: null },
    });
    expect(hoisted.liveRoomUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ streamHealth: "ended" }),
      }),
    );
  });

  it("cutLiveBroadcastAwsBilling never StopStreams a live OBS channel_hls room", async () => {
    const { cutLiveBroadcastAwsBilling } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamPaused: true,
      streamMode: "channel_hls",
      ivsStageArn: null,
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/obs",
    });

    await cutLiveBroadcastAwsBilling("room_1");

    expect(hoisted.channelSend).not.toHaveBeenCalled();
    expect(hoisted.compositionSend).not.toHaveBeenCalled();
  });

  it("cutLiveBroadcastAwsBilling skips when host is not paused and a publisher is still present", async () => {
    const { cutLiveBroadcastAwsBilling } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamPaused: false,
      streamMode: "stage_webrtc",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      ivsChannelArn: "arn:aws:ivs:us-east-1:123:channel/abc",
    });
    // ListParticipants (session) + ListParticipants (publishers)
    hoisted.compositionSend
      .mockResolvedValueOnce({ stageSessions: [{ sessionId: "sess_1" }] })
      .mockResolvedValueOnce({ participants: [{ participantId: "p1" }] });

    await cutLiveBroadcastAwsBilling("room_1");

    expect(hoisted.channelSend).not.toHaveBeenCalled();
    expect(hoisted.liveRoomUpdate).not.toHaveBeenCalled();
  });

  it("pauseAwsTeardownDelayMs defaults to 45s and honors LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS", async () => {
    const { pauseAwsTeardownDelayMs } = await import("@/services/ivs");
    const prev = process.env.LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS;
    delete process.env.LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS;
    expect(pauseAwsTeardownDelayMs()).toBe(45_000);
    process.env.LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS = "0";
    expect(pauseAwsTeardownDelayMs()).toBe(0);
    if (prev === undefined) delete process.env.LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS;
    else process.env.LIVE_PAUSE_AWS_TEARDOWN_DELAY_MS = prev;
  });
});

describe("ignoreChannelHealthDowngradeForActiveStage (Go Live race guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never blocks upgrades (live/connecting)", async () => {
    const { ignoreChannelHealthDowngradeForActiveStage } = await import("@/services/ivs");
    expect(
      await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId: "room_1", newHealth: "live" }),
    ).toBe(false);
    expect(hoisted.liveRoomFindUnique).not.toHaveBeenCalled();
  });

  it("blocks an offline downgrade while a stage room is live (empty HLS channel must not end the show)", async () => {
    const { ignoreChannelHealthDowngradeForActiveStage } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "stage_webrtc",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      streamStartedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(
      await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId: "room_1", newHealth: "offline" }),
    ).toBe(true);
  });

  it("blocks an offline downgrade during the Go-Live grace window before status flips to live", async () => {
    const { ignoreChannelHealthDowngradeForActiveStage } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "scheduled",
      streamMode: "stage_webrtc",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      streamStartedAt: new Date(Date.now() - 2_000),
    });
    expect(
      await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId: "room_1", newHealth: "offline" }),
    ).toBe(true);
  });

  it("allows the downgrade once the grace window has elapsed and the room is not live", async () => {
    const { ignoreChannelHealthDowngradeForActiveStage } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "ended",
      streamMode: "stage_webrtc",
      ivsStageArn: "arn:aws:ivs:us-east-1:123:stage/abc",
      streamStartedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    expect(
      await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId: "room_1", newHealth: "offline" }),
    ).toBe(false);
  });

  it("never guards non-stage broadcasts", async () => {
    const { ignoreChannelHealthDowngradeForActiveStage } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "channel_hls",
      ivsStageArn: null,
      streamStartedAt: new Date(),
    });
    expect(
      await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId: "room_1", newHealth: "offline" }),
    ).toBe(false);
  });
});

describe("OBS channel health flap guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isIvsChannelNotBroadcastingError detects AWS not-broadcasting faults", async () => {
    const { isIvsChannelNotBroadcastingError } = await import("@/services/ivs");
    expect(isIvsChannelNotBroadcastingError({ name: "ChannelNotBroadcasting" })).toBe(true);
    expect(isIvsChannelNotBroadcastingError({ name: "ThrottlingException" })).toBe(false);
  });

  it("debounceObsChannelHealthDowngrade holds the first OBS offline sample", async () => {
    const { debounceObsChannelHealthDowngrade } = await import("@/services/ivs");
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "channel_hls",
      lastIvsError: null,
    });
    hoisted.liveRoomUpdate.mockResolvedValueOnce({});

    expect(
      await debounceObsChannelHealthDowngrade({
        liveRoomId: "room_obs",
        previousHealth: "live",
        newHealth: "offline",
      }),
    ).toBe(true);
    expect(hoisted.liveRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room_obs" },
        data: expect.objectContaining({
          lastIvsError: expect.stringMatching(/^obs_offline_pending:/),
        }),
      }),
    );
  });

  it("debounceObsChannelHealthDowngrade confirms offline after the grace window", async () => {
    const { debounceObsChannelHealthDowngrade, OBS_CHANNEL_OFFLINE_CONFIRM_MS } = await import(
      "@/services/ivs"
    );
    const started = new Date(Date.now() - OBS_CHANNEL_OFFLINE_CONFIRM_MS - 1_000).toISOString();
    hoisted.liveRoomFindUnique.mockResolvedValueOnce({
      status: "live",
      streamMode: "channel_hls",
      lastIvsError: `obs_offline_pending:${started}`,
    });

    expect(
      await debounceObsChannelHealthDowngrade({
        liveRoomId: "room_obs",
        previousHealth: "live",
        newHealth: "offline",
      }),
    ).toBe(false);
    expect(hoisted.liveRoomUpdate).not.toHaveBeenCalled();
  });
});
