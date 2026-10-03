import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { markReplayRecordingReady, replayRetentionCutoff } from "@/lib/trust/live-replay-service";

function awsRegion(): string {
  return (
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "us-east-1"
  );
}

function awsCredentials(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId =
    process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not configured for live recording S3 access.");
  }
  return { accessKeyId, secretAccessKey };
}

function makeS3Client(): S3Client {
  return new S3Client({ region: awsRegion(), credentials: awsCredentials() });
}

/** arn:aws:ivs:<region>:<account>:channel/<channelId> */
function parseIvsChannelArn(arn: string): { accountId: string; channelId: string } | null {
  const m = /^arn:aws:ivs:[^:]+:(\d+):channel\/(.+)$/.exec(arn);
  if (!m) return null;
  return { accountId: m[1], channelId: m[2] };
}

/** Pull the yyyy/mm/dd/HH/mm path segment IVS's default key layout embeds, as a Date (UTC). */
function dateFromDefaultKeyPrefix(key: string, rootPrefix: string): Date | null {
  const rest = key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key;
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\//.exec(rest);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
}

export type ReplayBackfillOutcome =
  | "matched"
  | "would_match"
  | "expired"
  | "would_expire"
  | "no_channel"
  | "no_recording_found"
  | "error";

export type ReplayBackfillDetail = {
  replayId: string;
  liveRoomId: string | null;
  outcome: ReplayBackfillOutcome;
  s3KeyPrefix?: string;
};

export type ReplayBackfillSummary = {
  scanned: number;
  matched: number;
  markedExpired: number;
  skippedNoChannel: number;
  skippedNoRecording: number;
  errors: number;
  dryRun: boolean;
  details: ReplayBackfillDetail[];
};

/**
 * One-off (or periodic) recovery for `LiveStreamReplay` rows stuck in pending/recording because
 * the "Recording End" EventBridge event never arrived (e.g. the Sep 2026 DEAUTHORIZED-connection
 * outage). For each stuck replay:
 *
 * 1. If the replay is older than the replay retention window, the S3 lifecycle rule has already
 *    deleted its recording -- there is nothing to find, so it's marked `expired` (or reported as
 *    "would_expire" in dry-run) instead of being left stuck forever or endlessly re-scanned.
 * 2. Otherwise, lists the recordings bucket under IVS's default key layout
 *    (`ivs/v1/<account id>/<channel id>/<yyyy>/<mm>/<dd>/<HH>/<mm>/<stream id>/...`) for the
 *    channel the room used, picks whichever dated folder falls closest to the room's actual
 *    stream window (a channel can be reused across shows, so more than one folder can exist under
 *    the same channel root), and marks the replay ready if that folder contains
 *    `events/recording-ended.json`.
 *
 * Pass `dryRun: true` to compute and report every outcome without writing anything -- run this
 * first on a small `limit` (the report's own recommendation) before trusting it on the full
 * backlog.
 *
 * Assumes the account's IVS recording configuration uses AWS's default key prefix. If a custom
 * `keyPrefix` was set on the RecordingConfiguration instead, set `LIVE_RECORDING_S3_CUSTOM_PREFIX`
 * so the scan looks under `<customPrefix>/<channel id>/...` instead of `ivs/v1/<account id>/...`.
 */
export async function backfillStuckReplaysFromS3(
  limit = 50,
  options: { dryRun?: boolean } = {},
): Promise<ReplayBackfillSummary> {
  const dryRun = options.dryRun === true;
  const summary: ReplayBackfillSummary = {
    scanned: 0,
    matched: 0,
    markedExpired: 0,
    skippedNoChannel: 0,
    skippedNoRecording: 0,
    errors: 0,
    dryRun,
    details: [],
  };

  const bucket = process.env.AWS_IVS_RECORDINGS_BUCKET?.trim();
  if (!bucket) return summary;

  const stuck = await prisma.liveStreamReplay.findMany({
    where: { deletedAt: null, recordingStatus: { in: ["pending", "recording"] } },
    orderBy: { endedAt: "asc" },
    take: limit,
    select: {
      id: true,
      liveRoomId: true,
      startedAt: true,
      endedAt: true,
      liveRoom: { select: { ivsChannelArn: true } },
    },
  });
  summary.scanned = stuck.length;
  if (stuck.length === 0) return summary;

  const retentionCutoff = replayRetentionCutoff();
  const client = makeS3Client();
  const customPrefix = process.env.LIVE_RECORDING_S3_CUSTOM_PREFIX?.trim().replace(/\/+$/, "");

  for (const replay of stuck) {
    try {
      // The lifecycle rule has already deleted this recording's objects -- no S3 call will ever
      // find it, so stop treating it as "still trying" and record the real terminal state.
      if (replay.endedAt < retentionCutoff) {
        if (!dryRun) {
          await prisma.liveStreamReplay.update({
            where: { id: replay.id },
            data: {
              recordingStatus: "expired",
              recordingError: "Recording aged out of S3 retention before the end event was recovered.",
            },
          });
          logIvsOpsServer("ivs_recording_marked_expired", { replayId: replay.id, liveRoomId: replay.liveRoomId });
        }
        summary.markedExpired += 1;
        summary.details.push({
          replayId: replay.id,
          liveRoomId: replay.liveRoomId,
          outcome: dryRun ? "would_expire" : "expired",
        });
        continue;
      }

      const arn = replay.liveRoom?.ivsChannelArn;
      const parsed = arn ? parseIvsChannelArn(arn) : null;
      if (!arn || !parsed) {
        summary.skippedNoChannel += 1;
        summary.details.push({ replayId: replay.id, liveRoomId: replay.liveRoomId, outcome: "no_channel" });
        continue;
      }

      const rootPrefix = customPrefix
        ? `${customPrefix}/${parsed.channelId}/`
        : `ivs/v1/${parsed.accountId}/${parsed.channelId}/`;

      const objects: string[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: rootPrefix, ContinuationToken: token }),
        );
        for (const obj of page.Contents ?? []) {
          if (obj.Key) objects.push(obj.Key);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);

      const candidates = objects
        .filter((k) => k.endsWith("/events/recording-ended.json"))
        .map((k) => ({ key: k, at: dateFromDefaultKeyPrefix(k, rootPrefix) }))
        .filter((c): c is { key: string; at: Date } => c.at !== null);

      if (candidates.length === 0) {
        summary.skippedNoRecording += 1;
        summary.details.push({ replayId: replay.id, liveRoomId: replay.liveRoomId, outcome: "no_recording_found" });
        continue;
      }

      const target = replay.startedAt.getTime();
      candidates.sort((a, b) => Math.abs(a.at.getTime() - target) - Math.abs(b.at.getTime() - target));
      const best = candidates[0];
      const prefix = best.key.slice(0, best.key.length - "events/recording-ended.json".length);

      if (dryRun) {
        summary.matched += 1;
        summary.details.push({
          replayId: replay.id,
          liveRoomId: replay.liveRoomId,
          outcome: "would_match",
          s3KeyPrefix: prefix,
        });
        continue;
      }

      const result = await markReplayRecordingReady({
        channelArn: arn,
        s3Bucket: bucket,
        s3KeyPrefix: prefix,
      });
      if (result) {
        summary.matched += 1;
        summary.details.push({
          replayId: replay.id,
          liveRoomId: replay.liveRoomId,
          outcome: "matched",
          s3KeyPrefix: prefix,
        });
        logIvsOpsServer("ivs_recording_backfilled", {
          replayId: result.replayId,
          liveRoomId: result.liveRoomId,
        });
      } else {
        summary.skippedNoRecording += 1;
        summary.details.push({ replayId: replay.id, liveRoomId: replay.liveRoomId, outcome: "no_recording_found" });
      }
    } catch (e) {
      summary.errors += 1;
      summary.details.push({ replayId: replay.id, liveRoomId: replay.liveRoomId, outcome: "error" });
      console.error("[IVS_OPS] ivs_recording_backfill_failure", replay.id, e);
    }
  }

  return summary;
}
