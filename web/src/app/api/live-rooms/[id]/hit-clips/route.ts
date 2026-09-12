import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalHitClipShareUrl } from "@/lib/hit-clip";
import { resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

type PostBody = {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  clipUrl?: string | null;
  itemTitle?: string | null;
  teamOrSpotLabel?: string | null;
  liveRoomItemId?: string | null;
  durationMs?: number;
};

function serializeHitClip(row: {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  clipUrl: string | null;
  itemTitle: string | null;
  teamOrSpotLabel: string | null;
  shareCount: number;
  createdAt: Date;
  liveRoomId: string;
  sellerId: string;
  buyerId: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    clipUrl: row.clipUrl,
    itemTitle: row.itemTitle,
    teamOrSpotLabel: row.teamOrSpotLabel,
    shareCount: row.shareCount,
    createdAt: row.createdAt.toISOString(),
    liveRoomId: row.liveRoomId,
    sellerId: row.sellerId,
    buyerId: row.buyerId,
    shareUrl: canonicalHitClipShareUrl(row.id),
  };
}

/** Authenticated buyer/host: create a Hit Clip for this live room. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveOptionalLiveRoomsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      status: true,
      sellerId: true,
      title: true,
      thumbnailUrl: true,
      seller: { select: { username: true } },
    },
  });
  if (!room) return NextResponse.json({ error: "Live room not found." }, { status: 404 });
  if (room.status !== "live" && room.status !== "ended") {
    return NextResponse.json({ error: "Clips are only available during or after a live show." }, { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let itemTitle =
    typeof body.itemTitle === "string" && body.itemTitle.trim()
      ? body.itemTitle.trim().slice(0, 300)
      : null;
  let teamOrSpotLabel =
    typeof body.teamOrSpotLabel === "string" && body.teamOrSpotLabel.trim()
      ? body.teamOrSpotLabel.trim().slice(0, 200)
      : null;
  let thumbnailUrl =
    typeof body.thumbnailUrl === "string" && body.thumbnailUrl.trim()
      ? body.thumbnailUrl.trim().slice(0, 2000)
      : room.thumbnailUrl?.trim() || "";

  const liveRoomItemId =
    typeof body.liveRoomItemId === "string" && body.liveRoomItemId.trim()
      ? body.liveRoomItemId.trim()
      : null;
  if (liveRoomItemId) {
    const item = await prisma.liveRoomItem.findFirst({
      where: { id: liveRoomItemId, liveRoomId },
      select: { id: true, title: true, imageUrl: true },
    });
    if (!item) return NextResponse.json({ error: "liveRoomItemId not in this room." }, { status: 400 });
    if (!itemTitle) itemTitle = item.title;
    if (!thumbnailUrl && item.imageUrl) thumbnailUrl = item.imageUrl;
  } else if (!itemTitle) {
    const active = await prisma.liveRoomItem.findFirst({
      where: { liveRoomId, status: "active" },
      select: { title: true, imageUrl: true },
      orderBy: { sortOrder: "asc" },
    });
    if (active) {
      itemTitle = active.title;
      if (!thumbnailUrl && active.imageUrl) thumbnailUrl = active.imageUrl;
    }
  }

  const titleRaw = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const title =
    titleRaw ||
    (itemTitle ? `HIT · ${itemTitle}` : null) ||
    (room.title?.trim() ? `HIT · ${room.title.trim()}` : "HIT on Get Vaulted");

  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const clipUrl =
    typeof body.clipUrl === "string" && body.clipUrl.trim() ? body.clipUrl.trim().slice(0, 2000) : null;

  const clip = await prisma.hitClip.create({
    data: {
      liveRoomId,
      sellerId: room.sellerId,
      buyerId: userId === room.sellerId ? null : userId,
      title,
      description,
      thumbnailUrl,
      clipUrl,
      itemTitle,
      teamOrSpotLabel,
    },
  });

  return NextResponse.json({
    ok: true,
    clip: serializeHitClip(clip),
    sellerUsername: room.seller.username,
  });
}
