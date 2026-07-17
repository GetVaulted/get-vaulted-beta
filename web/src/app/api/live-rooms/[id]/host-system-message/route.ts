import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { processMessageMentions } from "@/lib/mentions/process-message-mentions";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

type PostBody = { body?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: false });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "body is required." }, { status: 400 });

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { sellerId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }

  const host = await prisma.user.findUnique({
    where: { id: room.sellerId },
    select: { username: true },
  });

  const msg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: room.sellerId,
      body: text,
      messageType: "system",
    },
    select: { id: true },
  });

  await processMessageMentions({
    db: prisma,
    sourceType: "live_room_message",
    sourceId: msg.id,
    body: text,
    senderId: room.sellerId,
    senderUsername: host?.username ?? "host",
    liveRoomId,
    notifyHref: `/live/${encodeURIComponent(liveRoomId)}`,
    notifyContext: "Live show chat",
  });

  void emitLiveRoomMessageById(msg.id);

  return NextResponse.json({ ok: true });
}
