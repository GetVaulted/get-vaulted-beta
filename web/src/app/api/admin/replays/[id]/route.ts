import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { adminDeleteReplay, serializeReplay } from "@/lib/trust/live-replay-service";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const liveRoomId = url.searchParams.get("liveRoomId")?.trim();

  const rows = await prisma.liveStreamReplay.findMany({
    where: {
      deletedAt: null,
      ...(liveRoomId ? { liveRoomId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ replays: rows.map(serializeReplay) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  await adminDeleteReplay({ replayId: decodeURIComponent(id), adminUserId: gate.userId });
  return NextResponse.json({ ok: true });
}
