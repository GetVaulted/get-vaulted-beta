import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  liveRoomFindUnique: vi.fn(),
  liveRoomFindFirst: vi.fn(),
  liveStreamReplayFindFirst: vi.fn(),
  liveStreamReplayCreate: vi.fn(),
  liveStreamReplayUpdate: vi.fn(),
  liveStreamReplayFindMany: vi.fn(),
  logTrust: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findUnique: hoisted.liveRoomFindUnique,
      findFirst: hoisted.liveRoomFindFirst,
    },
    liveStreamReplay: {
      findFirst: hoisted.liveStreamReplayFindFirst,
      create: hoisted.liveStreamReplayCreate,
      update: hoisted.liveStreamReplayUpdate,
      findMany: hoisted.liveStreamReplayFindMany,
    },
  },
}));

vi.mock("@/lib/trust/moderation-audit-log", () => ({
  logTrustModerationAction: hoisted.logTrust,
}));

import {
  finalizeLiveStreamReplay,
  markReplayRecordingFailed,
  markReplayRecordingReady,
  serializeReplay,
} from "@/lib/trust/live-replay-service";

describe("live-replay-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalize creates pending recording row without live HLS as VOD", async () => {
    const started = new Date("2026-07-01T12:00:00.000Z");
    const ended = new Date("2026-07-01T13:00:00.000Z");
    hoisted.liveRoomFindUnique.mockResolvedValue({
      id: "room_1",
      sellerId: "seller_1",
      ivsChannelArn: "arn:aws:ivs:us-east-1:1:channel/abc",
      streamStartedAt: started,
      streamEndedAt: ended,
      startedAt: started,
      endedAt: ended,
    });
    hoisted.liveStreamReplayFindFirst.mockResolvedValue(null);
    hoisted.liveStreamReplayCreate.mockResolvedValue({});

    await finalizeLiveStreamReplay("room_1");

    expect(hoisted.liveStreamReplayCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          liveRoomId: "room_1",
          recordingStatus: "recording",
          replayUrl: expect.stringMatching(/^pending:\/\//),
        }),
      }),
    );
    const url = hoisted.liveStreamReplayCreate.mock.calls[0][0].data.replayUrl as string;
    expect(url).not.toContain("m3u8");
  });

  it("markReplayRecordingReady stores S3 keys", async () => {
    hoisted.liveRoomFindFirst.mockResolvedValue({ id: "room_1" });
    hoisted.liveStreamReplayFindFirst.mockResolvedValue({ id: "replay_1" });
    hoisted.liveStreamReplayUpdate.mockResolvedValue({});

    const result = await markReplayRecordingReady({
      channelArn: "arn:aws:ivs:us-east-1:1:channel/abc",
      s3Bucket: "vaulted-live-recordings-beta",
      s3KeyPrefix: "ivs/v1/session",
    });

    expect(result).toEqual({ replayId: "replay_1", liveRoomId: "room_1" });
    expect(hoisted.liveStreamReplayUpdate).toHaveBeenCalledWith({
      where: { id: "replay_1" },
      data: expect.objectContaining({
        recordingStatus: "ready",
        s3Bucket: "vaulted-live-recordings-beta",
        s3KeyPrefix: "ivs/v1/session",
        hlsMasterKey: "ivs/v1/session/media/hls/master.m3u8",
      }),
    });
  });

  it("markReplayRecordingFailed updates status", async () => {
    hoisted.liveRoomFindFirst.mockResolvedValue({ id: "room_1" });
    hoisted.liveStreamReplayFindFirst.mockResolvedValue({ id: "replay_1" });
    hoisted.liveStreamReplayUpdate.mockResolvedValue({});

    await markReplayRecordingFailed({
      channelArn: "arn:aws:ivs:us-east-1:1:channel/abc",
      errorMessage: "boom",
    });

    expect(hoisted.liveStreamReplayUpdate).toHaveBeenCalledWith({
      where: { id: "replay_1" },
      data: { recordingStatus: "failed", recordingError: "boom" },
    });
  });

  it("serializeReplay hides pending and s3:// URLs", () => {
    const pending = serializeReplay({
      id: "r1",
      liveRoomId: "room",
      sellerId: "s",
      streamSessionId: null,
      replayUrl: "pending://x",
      durationSeconds: 10,
      startedAt: new Date(),
      endedAt: new Date(),
      createdAt: new Date(),
      recordingStatus: "recording",
      archiveStatus: "none",
    });
    expect(pending.replayUrl).toBeNull();
    expect(pending.replayPending).toBe(true);

    const ready = serializeReplay({
      id: "r2",
      liveRoomId: "room",
      sellerId: "s",
      streamSessionId: null,
      replayUrl: "s3://replay/room/r2",
      durationSeconds: 10,
      startedAt: new Date(),
      endedAt: new Date(),
      createdAt: new Date(),
      recordingStatus: "ready",
      archiveStatus: "none",
      s3Bucket: "b",
      s3KeyPrefix: "p",
    });
    expect(ready.replayUrl).toBeNull();
    expect(ready.replayPending).toBe(false);
    expect(ready.recordingStatus).toBe("ready");
  });
});
