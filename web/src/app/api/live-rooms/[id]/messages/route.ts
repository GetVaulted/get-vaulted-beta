import { NextResponse } from "next/server";
import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const exists = await prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.liveRoomMessage.findMany({
    where: { liveRoomId },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { sender: { select: { username: true } } },
  });

  return NextResponse.json({
    messages: rows.map(serializeLiveRoomMessage),
  });
}

type PostBody = {
  body?: string;
  messageType?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "Chat opens when the room is live." }, { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "Message body required." }, { status: 400 });

  /** Only chat may be created via this endpoint; bid/purchase/system are server-side. */
  const messageType: LiveRoomMessageType = "chat";

  const row = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: session.user.id,
      body: text,
      messageType,
    },
    include: { sender: { select: { username: true } } },
  });

  void emitLiveRoomMessageById(row.id);

  return NextResponse.json({ message: serializeLiveRoomMessage(row) });
}
