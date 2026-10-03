import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { beginReplayArchive } from "@/lib/trust/live-recording-s3";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const replayId = decodeURIComponent(id);

  try {
    const result = await beginReplayArchive(replayId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Archive failed";
    const status = /not found/i.test(message) ? 404 : /not ready/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
