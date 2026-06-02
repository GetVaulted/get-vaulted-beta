import { NextResponse } from "next/server";
import {
  generateObsWidgetTokenPlain,
  hashObsWidgetToken,
} from "@/lib/obs-widget-token";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";
import { prisma } from "@/lib/prisma";

/** Host-only: check whether a widget token exists (never returns the plain token). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  const auth = await requireLiveRoomHostAccess(liveRoomId, req);
  if (!auth.ok) return auth.response;

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { obsWidgetTokenHash: true, obsWidgetTokenRotatedAt: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  return NextResponse.json({
    hasToken: Boolean(room.obsWidgetTokenHash),
    rotatedAt: room.obsWidgetTokenRotatedAt?.toISOString() ?? null,
  });
}

/** Host-only: rotate widget token. Returns plain token once; only hash is stored. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  const auth = await requireLiveRoomHostAccess(liveRoomId, req);
  if (!auth.ok) return auth.response;

  const plain = generateObsWidgetTokenPlain();
  const hash = hashObsWidgetToken(plain);
  const rotatedAt = new Date();

  const updated = await prisma.liveRoom.updateMany({
    where: { id: liveRoomId },
    data: {
      obsWidgetTokenHash: hash,
      obsWidgetTokenRotatedAt: rotatedAt,
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    token: plain,
    rotatedAt: rotatedAt.toISOString(),
  });
}
