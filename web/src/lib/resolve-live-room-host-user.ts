import { NextResponse } from "next/server";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

/** Cookie session or mobile Bearer, then verify host (or admin) for this room. */
export async function requireLiveRoomHostUser(
  liveRoomId: string,
  request: Request,
  opts?: { requireBreak?: boolean },
) {
  const auth = await resolveLiveRoomsUserId(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const access = await getLiveRoomHostAccess(liveRoomId, auth.userId, opts);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return { userId: auth.userId, isAdmin: access.isAdmin, room: access.room };
}
