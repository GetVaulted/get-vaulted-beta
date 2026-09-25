import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildHitClipShareCaption, canonicalHitClipShareUrl } from "@/lib/hit-clip";
import { resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

type PatchBody = {
  clipUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  incrementShareCount?: boolean;
};

/** Public Hit Clip metadata for share pages + in-app players. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const clip = await prisma.hitClip.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      clipUrl: true,
      itemTitle: true,
      teamOrSpotLabel: true,
      shareCount: true,
      createdAt: true,
      liveRoomId: true,
      seller: { select: { id: true, username: true, image: true } },
      liveRoom: { select: { title: true, status: true } },
    },
  });
  if (!clip) return NextResponse.json({ error: "Hit clip not found." }, { status: 404 });

  const shareUrl = canonicalHitClipShareUrl(clip.id);
  return NextResponse.json({
    ok: true,
    clip: {
      id: clip.id,
      title: clip.title,
      description: clip.description,
      thumbnailUrl: clip.thumbnailUrl,
      clipUrl: clip.clipUrl,
      itemTitle: clip.itemTitle,
      teamOrSpotLabel: clip.teamOrSpotLabel,
      shareCount: clip.shareCount,
      createdAt: clip.createdAt.toISOString(),
      liveRoomId: clip.liveRoomId,
      liveRoomTitle: clip.liveRoom.title,
      liveRoomStatus: clip.liveRoom.status,
      seller: {
        id: clip.seller.id,
        username: clip.seller.username,
        avatarUrl: clip.seller.image,
      },
      shareUrl,
      shareCaption: buildHitClipShareCaption({
        title: clip.title,
        sellerUsername: clip.seller.username,
        shareUrl,
      }),
    },
  });
}

/** Attach uploaded video / bump share count. Creator or seller only for clipUrl updates. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const existing = await prisma.hitClip.findUnique({
    where: { id },
    select: { id: true, sellerId: true, buyerId: true, title: true },
  });
  if (!existing) return NextResponse.json({ error: "Hit clip not found." }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const onlyShareBump =
    body.incrementShareCount === true &&
    body.clipUrl == null &&
    body.thumbnailUrl == null &&
    body.title == null;

  // Public share pages may bump shareCount without auth.
  const userId = onlyShareBump ? null : await resolveOptionalLiveRoomsUserId(req);
  if (!onlyShareBump && !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canEditMedia =
    onlyShareBump || userId === existing.sellerId || userId === existing.buyerId;
  const data: {
    clipUrl?: string;
    thumbnailUrl?: string;
    title?: string;
    shareCount?: { increment: number };
  } = {};

  if (typeof body.clipUrl === "string" && body.clipUrl.trim()) {
    if (!canEditMedia || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    data.clipUrl = body.clipUrl.trim().slice(0, 2000);
  }
  if (typeof body.thumbnailUrl === "string" && body.thumbnailUrl.trim()) {
    if (!canEditMedia || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    data.thumbnailUrl = body.thumbnailUrl.trim().slice(0, 2000);
  }
  if (typeof body.title === "string" && body.title.trim()) {
    if (!canEditMedia || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    data.title = body.title.trim().slice(0, 300);
  }
  if (body.incrementShareCount === true) {
    data.shareCount = { increment: 1 };
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid updates." }, { status: 400 });
  }

  const updated = await prisma.hitClip.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      clipUrl: true,
      thumbnailUrl: true,
      shareCount: true,
      seller: { select: { username: true } },
    },
  });

  const shareUrl = canonicalHitClipShareUrl(updated.id);
  return NextResponse.json({
    ok: true,
    clip: {
      id: updated.id,
      title: updated.title,
      clipUrl: updated.clipUrl,
      thumbnailUrl: updated.thumbnailUrl,
      shareCount: updated.shareCount,
      shareUrl,
      shareCaption: buildHitClipShareCaption({
        title: updated.title,
        sellerUsername: updated.seller.username,
        shareUrl,
      }),
    },
  });
}
