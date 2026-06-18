import { NextResponse } from "next/server";
import { listLiveGiveawayEntriesForHost } from "@/lib/live-giveaway";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; giveawayId: string }> }) {
  const { id: raw, giveawayId: rawGiveawayId } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const giveawayId = decodeURIComponent(rawGiveawayId);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  const result = await listLiveGiveawayEntriesForHost(giveawayId, liveRoomId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ entries: result.entries });
}
