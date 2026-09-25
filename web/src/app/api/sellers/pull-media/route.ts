/**
 * Public, read-only "Pulls" gallery for a seller's profile — no auth required.
 * Mirrors `/api/sellers/shop`'s sellerId-or-username lookup so both the mobile
 * UserProfileScreen "Pulls" tab and the web seller page can share one endpoint.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { viewerCanSeeUser } from "@/lib/user-block";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sellerIdParam = searchParams.get("sellerId")?.trim();
  const usernameParam = searchParams.get("username")?.trim();

  if (!sellerIdParam && !usernameParam) {
    return NextResponse.json({ error: "sellerId or username is required." }, { status: 400 });
  }

  const user = sellerIdParam
    ? await prisma.user.findFirst({
        where: { id: sellerIdParam, suspendedAt: null },
        select: { id: true, email: true },
      })
    : await prisma.user.findUnique({
        where: { username: decodeURIComponent(usernameParam!) },
        select: { id: true, email: true },
      });

  if (!user) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }

  const viewerId = await resolveOptionalListingsUserId(req);
  const viewer = viewerId
    ? await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } })
    : null;
  const isOwn = viewerId === user.id;
  const isAdmin = viewer?.role === "admin";
  if (isHiddenFixtureSellerEmail(user.email) && !isOwn && !isAdmin) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }
  if (!(await viewerCanSeeUser(prisma, viewerId, user.id))) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }

  const rows = await prisma.profilePullMedia.findMany({
    where: { sellerId: user.id },
    orderBy: { sortOrder: "asc" },
    take: 25,
    include: {
      _count: { select: { likes: true, comments: true } },
      ...(viewerId ? { likes: { where: { userId: viewerId }, select: { id: true } } } : {}),
    },
  });

  const media = rows.map((row) => {
    const { _count, likes, ...rest } = row as typeof row & { likes?: { id: string }[] };
    return {
      ...rest,
      likeCount: _count.likes,
      commentCount: _count.comments,
      viewerHasLiked: viewerId ? Boolean(likes && likes.length) : false,
    };
  });

  return NextResponse.json({ media });
}
