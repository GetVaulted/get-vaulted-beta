import { NextResponse } from "next/server";
import { enterOpenGiveaway } from "@/lib/live-giveaway";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomGiveawaysChanged } from "@/lib/realtime-emit-server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; giveawayId: string }> }) {
  const { id: raw, giveawayId: rawGiveawayId } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const giveawayId = decodeURIComponent(rawGiveawayId);

  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const result = await enterOpenGiveaway(giveawayId, liveRoomId, auth.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  emitLiveRoomGiveawaysChanged(liveRoomId);
  return NextResponse.json({ ok: true });
}
