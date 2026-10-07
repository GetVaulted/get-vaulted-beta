import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

/**
 * Per-server-instance write throttle. Without it every viewer in a big show posts the same count every few
 * seconds and they all fight over one `LiveRoom` row. A write within `MIN_WRITE_INTERVAL_MS` of the last one
 * for the same room is acknowledged but skipped; the next one lands moments later.
 */
const MIN_WRITE_INTERVAL_MS = 3_000;
const MAX_TRACKED_ROOMS = 2_000;
const lastWriteByRoom = new Map<string, number>();

function shouldSkipWrite(liveRoomId: string, nowMs: number): boolean {
  const last = lastWriteByRoom.get(liveRoomId);
  if (last != null && nowMs - last < MIN_WRITE_INTERVAL_MS) return true;
  if (lastWriteByRoom.size >= MAX_TRACKED_ROOMS) {
    const oldest = lastWriteByRoom.keys().next().value;
    if (oldest !== undefined) lastWriteByRoom.delete(oldest);
  }
  lastWriteByRoom.delete(liveRoomId);
  lastWriteByRoom.set(liveRoomId, nowMs);
  return false;
}

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

  // Cheap early exit before any database work (a big show sends many of these).
  if (shouldSkipWrite(liveRoomId, Date.now())) {
    return NextResponse.json({ ok: true, viewerCount, throttled: true });
  }

  // One query in the common case; only look the room up again to explain a miss.
  const now = new Date();
  const updated = await prisma.liveRoom.updateMany({
    where: { id: liveRoomId, status: { not: "ended" } },
    data: { viewerCount, viewerCountUpdatedAt: now },
  });
  if (updated.count === 0) {
    lastWriteByRoom.delete(liveRoomId);
    const room = await prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { id: true, status: true },
    });
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, viewerCount });
}
