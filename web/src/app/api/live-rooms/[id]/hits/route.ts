import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

type PostBody = {
  title?: string;
  notes?: string;
  spotLabel?: string;
  liveRoomItemId?: string | null;
  buyerUserId?: string | null;
  imageUrl?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return NextResponse.json({ error: "title is required." }, { status: 400 });

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
  const spotLabel = typeof body.spotLabel === "string" ? body.spotLabel.trim().slice(0, 200) : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim().slice(0, 2000) : "";

  const liveRoomItemId =
    typeof body.liveRoomItemId === "string" && body.liveRoomItemId.trim()
      ? body.liveRoomItemId.trim()
      : null;
  if (liveRoomItemId) {
    const it = await prisma.liveRoomItem.findFirst({
      where: { id: liveRoomItemId, liveRoomId },
      select: { id: true },
    });
    if (!it) return NextResponse.json({ error: "liveRoomItemId not in this room." }, { status: 400 });
  }

  let buyerId: string | null = null;
  if (typeof body.buyerUserId === "string" && body.buyerUserId.trim()) {
    const u = await prisma.user.findUnique({
      where: { id: body.buyerUserId.trim() },
      select: { id: true, username: true, suspendedAt: true },
    });
    if (!u || u.suspendedAt) return NextResponse.json({ error: "Buyer not found or suspended." }, { status: 400 });
    buyerId = u.id;
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { sellerId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hit = await prisma.breakHit.create({
    data: {
      liveRoomId,
      liveRoomItemId,
      spotLabel,
      buyerId,
      title,
      notes,
      imageUrl,
    },
    select: { id: true },
  });

  const buyerLine = buyerId ? " (buyer logged)" : "";
  const sysMsg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: room.sellerId,
      body: `Hit logged: ${title}${spotLabel ? ` · ${spotLabel}` : ""}${buyerLine}.`,
      messageType: "system",
    },
    select: { id: true },
  });

  void emitLiveRoomMessageById(sysMsg.id);

  return NextResponse.json({ ok: true, hitId: hit.id });
}
