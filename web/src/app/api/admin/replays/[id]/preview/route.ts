import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { presignHlsMasterPreview } from "@/lib/trust/live-recording-s3";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const row = await prisma.liveStreamReplay.findFirst({
    where: { id: decodeURIComponent(id), deletedAt: null },
    select: {
      recordingStatus: true,
      s3Bucket: true,
      hlsMasterKey: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Replay not found." }, { status: 404 });
  }
  if (row.recordingStatus !== "ready" || !row.s3Bucket || !row.hlsMasterKey) {
    return NextResponse.json({ error: "Recording preview is not available yet." }, { status: 409 });
  }

  try {
    const signed = await presignHlsMasterPreview({
      bucket: row.s3Bucket,
      hlsMasterKey: row.hlsMasterKey,
    });
    return NextResponse.json({
      ok: true,
      url: signed.url,
      expiresAt: signed.expiresAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sign preview URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
