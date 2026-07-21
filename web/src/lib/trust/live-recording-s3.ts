import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import { prisma } from "@/lib/prisma";

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

export function recordingsBucket(): string {
  const bucket = process.env.AWS_IVS_RECORDINGS_BUCKET?.trim() || "";
  if (!bucket) throw new Error("AWS_IVS_RECORDINGS_BUCKET is not configured.");
  return bucket;
}

function makeS3Client(): S3Client {
  return new S3Client({
    region: awsRegion(),
    credentials: awsCredentials(),
  });
}

async function listAllKeys(client: S3Client, bucket: string, prefix: string): Promise<_Object[]> {
  const out: _Object[] = [];
  let token: string | undefined;
  const normalized = prefix.replace(/\/+$/, "");
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${normalized}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) out.push(obj);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

function archiveKeyForReplay(replayId: string): string {
  return `archives/${replayId}.zip`;
}

/** Presign GET for an existing archive ZIP. */
export async function presignArchiveDownload(args: {
  bucket: string;
  archiveS3Key: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; expiresAt: string }> {
  const client = makeS3Client();
  const expiresIn = args.expiresInSeconds ?? 3600;
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: args.bucket, Key: args.archiveS3Key }),
    { expiresIn },
  );
  return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

/** Presign GET for the HLS master playlist (admin preview). */
export async function presignHlsMasterPreview(args: {
  bucket: string;
  hlsMasterKey: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; expiresAt: string }> {
  return presignArchiveDownload({
    bucket: args.bucket,
    archiveS3Key: args.hlsMasterKey,
    expiresInSeconds: args.expiresInSeconds ?? 900,
  });
}

/**
 * Build a ZIP of the HLS package under `s3KeyPrefix` and upload to `archives/{replayId}.zip`.
 * Streams via multipart upload — intended for background / cron.
 */
export async function packReplayArchiveToS3(replayId: string): Promise<void> {
  const replay = await prisma.liveStreamReplay.findUnique({
    where: { id: replayId },
    select: {
      id: true,
      s3Bucket: true,
      s3KeyPrefix: true,
      archiveStatus: true,
      recordingStatus: true,
      deletedAt: true,
    },
  });
  if (!replay || replay.deletedAt) {
    throw new Error("Replay not found.");
  }
  if (replay.recordingStatus !== "ready" || !replay.s3Bucket || !replay.s3KeyPrefix) {
    throw new Error("Recording is not ready for archive.");
  }

  await prisma.liveStreamReplay.update({
    where: { id: replayId },
    data: { archiveStatus: "preparing", recordingError: null },
  });

  const client = makeS3Client();
  const bucket = replay.s3Bucket;
  const prefix = replay.s3KeyPrefix.replace(/\/+$/, "");
  const archiveKey = archiveKeyForReplay(replayId);

  try {
    const objects = await listAllKeys(client, bucket, prefix);
    if (objects.length === 0) {
      throw new Error("No recording objects found under S3 prefix.");
    }

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 1 } });
    archive.on("error", (err) => {
      pass.destroy(err);
    });
    archive.pipe(pass);

    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: archiveKey,
        Body: pass,
        ContentType: "application/zip",
      },
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
    });

    const uploadDone = upload.done();

    for (const obj of objects) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = got.Body;
      if (!body) continue;
      const relative = key.startsWith(prefix) ? key.slice(prefix.length).replace(/^\//, "") : key;
      const nodeStream =
        body instanceof Readable
          ? body
          : Readable.fromWeb(body as unknown as import("stream/web").ReadableStream);
      archive.append(nodeStream, { name: relative || key.split("/").pop() || "file" });
    }

    await archive.finalize();
    await uploadDone;

    await prisma.liveStreamReplay.update({
      where: { id: replayId },
      data: {
        archiveStatus: "ready",
        archiveS3Key: archiveKey,
        recordingError: null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "Archive pack failed";
    await prisma.liveStreamReplay.update({
      where: { id: replayId },
      data: {
        archiveStatus: "failed",
        recordingError: message,
      },
    });
    throw e;
  }
}

/** Mark archive preparing and kick packing (cron finishes if request times out). */
export async function beginReplayArchive(replayId: string): Promise<{ archiveStatus: string }> {
  const replay = await prisma.liveStreamReplay.findUnique({
    where: { id: replayId },
    select: {
      id: true,
      recordingStatus: true,
      archiveStatus: true,
      s3Bucket: true,
      s3KeyPrefix: true,
      deletedAt: true,
    },
  });
  if (!replay || replay.deletedAt) throw new Error("Replay not found.");
  if (replay.recordingStatus !== "ready" || !replay.s3Bucket || !replay.s3KeyPrefix) {
    throw new Error("Recording is not ready for archive.");
  }
  if (replay.archiveStatus === "ready") {
    return { archiveStatus: "ready" };
  }
  if (replay.archiveStatus === "preparing") {
    return { archiveStatus: "preparing" };
  }

  await prisma.liveStreamReplay.update({
    where: { id: replayId },
    data: { archiveStatus: "preparing", recordingError: null },
  });

  void packReplayArchiveToS3(replayId).catch(() => {
    /* status already updated inside packReplayArchiveToS3 */
  });

  return { archiveStatus: "preparing" };
}

/** Cron: finish archives stuck in preparing. */
export async function reconcilePreparingReplayArchives(limit = 3): Promise<{ packed: number; failed: number }> {
  const rows = await prisma.liveStreamReplay.findMany({
    where: {
      deletedAt: null,
      recordingStatus: "ready",
      archiveStatus: "preparing",
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 10),
    select: { id: true },
  });

  let packed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await packReplayArchiveToS3(row.id);
      packed += 1;
    } catch {
      failed += 1;
    }
  }
  return { packed, failed };
}
