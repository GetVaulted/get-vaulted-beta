import { NextResponse } from "next/server";
import { listActiveReplaysForRoom } from "@/lib/trust/live-replay-service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const replays = await listActiveReplaysForRoom(liveRoomId);
  return NextResponse.json({ replays });
}
