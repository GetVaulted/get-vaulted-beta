import { NextResponse } from "next/server";
import { buildObsWidgetSnapshot } from "@/lib/obs-widget-snapshot";
import { verifyObsWidgetToken } from "@/lib/obs-widget-token";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Read-only overlay snapshot for OBS browser sources — token auth, no session required. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing widget token." }, { status: 401 });
  }

  const rl = checkRateLimit(`obs-widget:${clientKey(req)}:${liveRoomId}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { obsWidgetTokenHash: true, status: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!verifyObsWidgetToken(token, room.obsWidgetTokenHash)) {
    return NextResponse.json({ error: "Invalid widget token." }, { status: 401 });
  }

  const snapshot = await buildObsWidgetSnapshot(liveRoomId);
  if (!snapshot) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    { snapshot },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
