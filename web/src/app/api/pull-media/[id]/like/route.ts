/**
 * Like / unlike a seller's pull photo or video. Mirrors the `/api/sellers/[sellerId]/follow`
 * toggle pattern: POST creates the row (idempotent — a duplicate like just reports the
 * current state rather than erroring, since a double-tap heart shouldn't surface an error),
 * DELETE removes it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createNotification } from "@/lib/notifications";
import { isUserBlocked } from "@/lib/user-block";

export const runtime = "nodejs";

async function loadPullMedia(id: string) {
  return prisma.profilePullMedia.findUnique({
    where: { id },
    select: { id: true, sellerId: true },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const pull = await loadPullMedia(id);
  if (!pull) return NextResponse.json({ error: "Pull not found." }, { status: 404 });

  if (pull.sellerId !== auth.userId && (await isUserBlocked(prisma, auth.userId, pull.sellerId))) {
    return NextResponse.json({ error: "You cannot like this." }, { status: 403 });
  }

  try {
    await prisma.pullLike.create({
      data: { pullMediaId: id, userId: auth.userId },
    });

    if (pull.sellerId !== auth.userId) {
      const liker = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { username: true },
      });
      if (liker?.username) {
        await createNotification(prisma, {
          userId: pull.sellerId,
          type: "pull_liked",
          title: "New like",
          body: `@${liker.username} loved one of your pulls.`,
          href: `/account/seller/pulls`,
        });
      }
    }
  } catch {
    // Unique constraint — already liked. Fall through and report current state.
  }

  const likeCount = await prisma.pullLike.count({ where: { pullMediaId: id } });
  return NextResponse.json({ liked: true, likeCount });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  await prisma.pullLike.deleteMany({ where: { pullMediaId: id, userId: auth.userId } });

  const likeCount = await prisma.pullLike.count({ where: { pullMediaId: id } });
  return NextResponse.json({ liked: false, likeCount });
}
