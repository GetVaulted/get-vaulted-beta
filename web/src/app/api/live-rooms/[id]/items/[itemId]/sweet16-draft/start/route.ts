import { NextResponse } from "next/server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { startSweet16Draft, Sweet16Error } from "@/lib/live-sweet16-draft";

/** Host: start the live Sweet 16 draft once all 16 blind slots for this item are sold. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: rawRoom, itemId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  if (hostAuth.room.status === "ended") {
    return NextResponse.json({ error: "This room has ended." }, { status: 409 });
  }

  try {
    const draft = await startSweet16Draft({ liveRoomId, itemId });
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof Sweet16Error) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[sweet16-draft/start] failed", {
      liveRoomId,
      itemId,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Could not start the draft." }, { status: 500 });
  }
}
