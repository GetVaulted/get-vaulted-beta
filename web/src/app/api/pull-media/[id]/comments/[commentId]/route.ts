/**
 * Delete a comment on a pull. Allowed for the comment's own author, or the pull's owning
 * seller moderating their own profile (mirrors `LiveRoomMessage`'s moderator soft-delete).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id, commentId } = await ctx.params;

  const comment = await prisma.pullComment.findUnique({
    where: { id: commentId },
    select: { id: true, pullMediaId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.pullMediaId !== id || comment.deletedAt) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  const pull = await prisma.profilePullMedia.findUnique({
    where: { id },
    select: { sellerId: true },
  });
  if (!pull) return NextResponse.json({ error: "Pull not found." }, { status: 404 });

  const canDelete = comment.authorId === auth.userId || pull.sellerId === auth.userId;
  if (!canDelete) {
    return NextResponse.json({ error: "You cannot delete this comment." }, { status: 403 });
  }

  await prisma.pullComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date(), deletedByUserId: auth.userId },
  });

  return NextResponse.json({ ok: true });
}
