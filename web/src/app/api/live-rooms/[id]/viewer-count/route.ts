import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

/**
 * Persist concurrent viewer count from live presence so discovery / OBS / OG
 * match the in-room counter. Any signed-in participant may sync (host or buyer)
 * so the feed stays accurate when the host console is closed. Stale rows expire
 * via `viewerCountUpdatedAt` (see `effectiveLiveRoomViewerCount`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: { viewerCount?: unknown };
  try {
    body = (await req.json()) as { viewerCount?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawCount = body.viewerCount;
  if (typeof rawCount !== "number" || !Number.isFinite(rawCount)) {
    return NextResponse.json({ error: "viewerCount must be a number." }, { status: 400 });
  }
  const viewerCount = Math.max(0, Math.min(100_000, Math.floor(rawCount)));

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }

  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: liveRoomId },
    data: { viewerCount, viewerCountUpdatedAt: now },
  });

  return NextResponse.json({ ok: true, viewerCount });
}
