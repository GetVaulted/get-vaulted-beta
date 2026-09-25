import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { beginReplayArchive, presignArchiveDownload } from "@/lib/trust/live-recording-s3";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const replayId = decodeURIComponent(id);

  const row = await prisma.liveStreamReplay.findFirst({
    where: { id: replayId, deletedAt: null },
    select: {
      id: true,
      recordingStatus: true,
      archiveStatus: true,
      archiveS3Key: true,
      s3Bucket: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Replay not found." }, { status: 404 });
  }
  if (row.recordingStatus !== "ready" || !row.s3Bucket) {
    return NextResponse.json({ error: "Recording is not ready for download." }, { status: 409 });
  }

  if (row.archiveStatus !== "ready" || !row.archiveS3Key) {
    if (row.archiveStatus !== "preparing") {
      await beginReplayArchive(replayId);
    }
    return NextResponse.json(
      {
        ok: false,
        preparing: true,
        archiveStatus: "preparing",
        message: "Archive is being prepared. Retry download in a moment.",
      },
      { status: 202 },
    );
  }

  try {
    const signed = await presignArchiveDownload({
      bucket: row.s3Bucket,
      archiveS3Key: row.archiveS3Key,
    });
    return NextResponse.json({
      ok: true,
      url: signed.url,
      expiresAt: signed.expiresAt,
      archiveS3Key: row.archiveS3Key,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sign download URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
