/**
 * Comments on a seller's pull photo/video. GET is public (buyers browsing a profile don't
 * need an account to read them, same as the gallery itself); POST requires auth.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId, resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { validatePullCommentBody } from "@/lib/profile-media-requirements";
import { createNotification } from "@/lib/notifications";
import { isUserBlocked, listHiddenPeerIdsForViewer } from "@/lib/user-block";

export const runtime = "nodejs";

const COMMENT_AUTHOR_SELECT = {
  id: true,
  username: true,
  image: true,
} as const;

async function loadPullMedia(id: string) {
  return prisma.profilePullMedia.findUnique({
    where: { id },
    select: { id: true, sellerId: true },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pull = await loadPullMedia(id);
  if (!pull) return NextResponse.json({ error: "Pull not found." }, { status: 404 });

  const viewerId = await resolveOptionalListingsUserId(req);
  const hiddenIds = viewerId ? new Set(await listHiddenPeerIdsForViewer(prisma, viewerId)) : new Set<string>();

  const rows = await prisma.pullComment.findMany({
    where: { pullMediaId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: COMMENT_AUTHOR_SELECT },
    },
  });

  const comments = rows
    .filter((r) => !hiddenIds.has(r.authorId))
    .map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: r.author,
      canDelete: viewerId != null && (viewerId === r.authorId || viewerId === pull.sellerId),
    }));

  return NextResponse.json({ comments });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const pull = await loadPullMedia(id);
  if (!pull) return NextResponse.json({ error: "Pull not found." }, { status: 404 });

  if (pull.sellerId !== auth.userId && (await isUserBlocked(prisma, auth.userId, pull.sellerId))) {
    return NextResponse.json({ error: "You cannot comment on this." }, { status: 403 });
  }

  let json: { body?: unknown };
  try {
    json = (await req.json()) as { body?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const check = validatePullCommentBody(typeof json.body === "string" ? json.body : "");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const row = await prisma.pullComment.create({
    data: { pullMediaId: id, authorId: auth.userId, body: check.body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: COMMENT_AUTHOR_SELECT },
    },
  });

  if (pull.sellerId !== auth.userId && row.author.username) {
    await createNotification(prisma, {
      userId: pull.sellerId,
      type: "pull_commented",
      title: "New comment",
      body: `@${row.author.username} commented on one of your pulls: "${check.body.slice(0, 120)}"`,
      href: `/account/seller/pulls`,
    });
  }

  return NextResponse.json({
    comment: { ...row, canDelete: true },
  });
}
