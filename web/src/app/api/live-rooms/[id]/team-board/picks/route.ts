import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { emitTeamBoardChanged } from "@/lib/realtime-emit-server";
import { getTeamBoardPublicPayload } from "@/lib/team-board-public-server";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.liveRoomTeamBoardPick.deleteMany({ where: { liveRoomId } });

  void emitTeamBoardChanged(liveRoomId);

  const payload = await getTeamBoardPublicPayload(liveRoomId);
  if (!payload) {
    return NextResponse.json({ error: "Team board payload missing after reset." }, { status: 500 });
  }
  return NextResponse.json(payload);
}
