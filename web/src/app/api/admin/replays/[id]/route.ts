import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { adminDeleteReplay, serializeReplay } from "@/lib/trust/live-replay-service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const row = await prisma.liveStreamReplay.findFirst({
    where: { id: decodeURIComponent(id), deletedAt: null },
  });
  if (!row) {
    return NextResponse.json({ error: "Replay not found." }, { status: 404 });
  }

  return NextResponse.json({ replay: serializeReplay(row) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  await adminDeleteReplay({ replayId: decodeURIComponent(id), adminUserId: gate.userId });
  return NextResponse.json({ ok: true });
}
