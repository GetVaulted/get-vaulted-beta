import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";
import { requireHostAccess } from "../stream/_shared";

type PatchBody = {
  streamPaused?: boolean;
};

/** Host-only stream transport settings (pause/resume video without ending the show). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const auth = await requireHostAccess(liveRoomId, req);
  if (!auth.ok) return auth.response;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.streamPaused !== "boolean") {
    return NextResponse.json({ error: "No valid updates." }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { status: true, streamHealth: true, streamPaused: true, roomVersion: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Live room not found." }, { status: 404 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "Stream can only be paused while the show is live." }, { status: 409 });
  }

  const streamPaused = body.streamPaused;
  const updated = await prisma.liveRoom.update({
    where: { id: liveRoomId },
    data: {
      streamPaused,
      roomVersion: { increment: 1 },
    },
    select: { streamHealth: true, streamPaused: true, roomVersion: true },
  });

  emitStreamStatusChanged(liveRoomId, {
    streamHealth: updated.streamHealth,
    streamPaused: updated.streamPaused,
    roomVersion: updated.roomVersion,
  });

  return NextResponse.json({ ok: true, streamPaused: updated.streamPaused });
}
