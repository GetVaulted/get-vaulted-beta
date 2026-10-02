import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  liveStreamReplayFindMany: vi.fn(),
  liveStreamReplayUpdate: vi.fn(),
  markReplayRecordingReady: vi.fn(),
  replayRetentionCutoff: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveStreamReplay: {
      findMany: hoisted.liveStreamReplayFindMany,
      update: hoisted.liveStreamReplayUpdate,
    },
  },
}));

vi.mock("@/lib/trust/live-replay-service", () => ({
  markReplayRecordingReady: hoisted.markReplayRecordingReady,
  replayRetentionCutoff: hoisted.replayRetentionCutoff,
}));

vi.mock("@/lib/ivs-ops-log", () => ({
  logIvsOpsServer: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: hoisted.s3Send })),
  ListObjectsV2Command: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { backfillStuckReplaysFromS3 } from "@/lib/trust/live-replay-backfill";

const RETENTION_CUTOFF = new Date("2026-09-01T00:00:00.000Z");

describe("backfillStuckReplaysFromS3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_IVS_RECORDINGS_BUCKET = "vaulted-live-recordings-beta";
    process.env.VAULTED_AWS_ACCESS_KEY_ID = "test-key";
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY = "test-secret";
    hoisted.replayRetentionCutoff.mockReturnValue(RETENTION_CUTOFF);
  });

  it("marks a replay older than the retention cutoff as expired, without touching S3", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_old",
        liveRoomId: "room_old",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        endedAt: new Date("2026-08-01T01:00:00.000Z"),
        liveRoom: { ivsChannelArn: "arn:aws:ivs:us-east-1:111:channel/abc" },
      },
    ]);

    const result = await backfillStuckReplaysFromS3(50);

    expect(hoisted.s3Send).not.toHaveBeenCalled();
    expect(hoisted.liveStreamReplayUpdate).toHaveBeenCalledWith({
      where: { id: "replay_old" },
      data: {
        recordingStatus: "expired",
        recordingError: "Recording aged out of S3 retention before the end event was recovered.",
      },
    });
    expect(result.markedExpired).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.details).toEqual([{ replayId: "replay_old", liveRoomId: "room_old", outcome: "expired" }]);
  });

  it("dry run reports would_expire without writing to the DB", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_old",
        liveRoomId: "room_old",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        endedAt: new Date("2026-08-01T01:00:00.000Z"),
        liveRoom: { ivsChannelArn: "arn:aws:ivs:us-east-1:111:channel/abc" },
      },
    ]);

    const result = await backfillStuckReplaysFromS3(50, { dryRun: true });

    expect(hoisted.liveStreamReplayUpdate).not.toHaveBeenCalled();
    expect(hoisted.markReplayRecordingReady).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.markedExpired).toBe(1);
    expect(result.details[0].outcome).toBe("would_expire");
  });

  it("finds a recording still inside the retention window and marks it ready", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_recent",
        liveRoomId: "room_recent",
        startedAt: new Date("2026-09-15T12:00:00.000Z"),
        endedAt: new Date("2026-09-15T13:00:00.000Z"),
        liveRoom: { ivsChannelArn: "arn:aws:ivs:us-east-1:111:channel/xyz" },
      },
    ]);
    hoisted.s3Send.mockResolvedValue({
      Contents: [
        {
          Key: "ivs/v1/111/xyz/2026/09/15/12/01/streamid123/events/recording-ended.json",
        },
      ],
      IsTruncated: false,
    });
    hoisted.markReplayRecordingReady.mockResolvedValue({ replayId: "replay_recent", liveRoomId: "room_recent" });

    const result = await backfillStuckReplaysFromS3(50);

    expect(hoisted.s3Send).toHaveBeenCalledTimes(1);
    expect(hoisted.markReplayRecordingReady).toHaveBeenCalledWith({
      channelArn: "arn:aws:ivs:us-east-1:111:channel/xyz",
      s3Bucket: "vaulted-live-recordings-beta",
      s3KeyPrefix: "ivs/v1/111/xyz/2026/09/15/12/01/streamid123/",
    });
    expect(result.matched).toBe(1);
    expect(result.details[0].outcome).toBe("matched");
  });

  it("dry run on a recent recording reports would_match without calling markReplayRecordingReady", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_recent",
        liveRoomId: "room_recent",
        startedAt: new Date("2026-09-15T12:00:00.000Z"),
        endedAt: new Date("2026-09-15T13:00:00.000Z"),
        liveRoom: { ivsChannelArn: "arn:aws:ivs:us-east-1:111:channel/xyz" },
      },
    ]);
    hoisted.s3Send.mockResolvedValue({
      Contents: [
        { Key: "ivs/v1/111/xyz/2026/09/15/12/01/streamid123/events/recording-ended.json" },
      ],
      IsTruncated: false,
    });

    const result = await backfillStuckReplaysFromS3(50, { dryRun: true });

    expect(hoisted.markReplayRecordingReady).not.toHaveBeenCalled();
    expect(result.details[0].outcome).toBe("would_match");
    expect(result.details[0].s3KeyPrefix).toBe("ivs/v1/111/xyz/2026/09/15/12/01/streamid123/");
  });

  it("skips a replay with no channel ARN on its room", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_no_channel",
        liveRoomId: "room_x",
        startedAt: new Date("2026-09-15T12:00:00.000Z"),
        endedAt: new Date("2026-09-15T13:00:00.000Z"),
        liveRoom: { ivsChannelArn: null },
      },
    ]);

    const result = await backfillStuckReplaysFromS3(50);

    expect(result.skippedNoChannel).toBe(1);
    expect(result.details[0].outcome).toBe("no_channel");
  });

  it("reports no_recording_found when S3 has no matching recording-ended marker", async () => {
    hoisted.liveStreamReplayFindMany.mockResolvedValue([
      {
        id: "replay_recent",
        liveRoomId: "room_recent",
        startedAt: new Date("2026-09-15T12:00:00.000Z"),
        endedAt: new Date("2026-09-15T13:00:00.000Z"),
        liveRoom: { ivsChannelArn: "arn:aws:ivs:us-east-1:111:channel/xyz" },
      },
    ]);
    hoisted.s3Send.mockResolvedValue({ Contents: [], IsTruncated: false });

    const result = await backfillStuckReplaysFromS3(50);

    expect(result.skippedNoRecording).toBe(1);
    expect(result.details[0].outcome).toBe("no_recording_found");
  });

  it("returns an empty summary with no S3 calls when the bucket env var is unset", async () => {
    delete process.env.AWS_IVS_RECORDINGS_BUCKET;
    const result = await backfillStuckReplaysFromS3(50);
    expect(hoisted.liveStreamReplayFindMany).not.toHaveBeenCalled();
    expect(result.scanned).toBe(0);
  });
});
