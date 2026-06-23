import { NextResponse } from "next/server";
import { searchLiveRoomMentionUsers } from "@/lib/mentions/search-live-room-mention-users";
import { liveRoomChatOpen } from "@/lib/live-room-chat-policy";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!liveRoomChatOpen(room.status)) {
    return NextResponse.json({ error: "Chat is not open for this room." }, { status: 409 });
  }

  const users = await searchLiveRoomMentionUsers(liveRoomId, q, auth.userId);
  return NextResponse.json({ users });
}
