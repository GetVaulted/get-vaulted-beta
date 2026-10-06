import { NextResponse } from "next/server";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { loadSellerReviewSummary, loadSellerReviews } from "@/lib/seller-review-queries";
import { viewerCanSeeUser } from "@/lib/user-block";

const PAGE_SIZE = 20;

/** Public: a seller's reviews (newest first) plus the rating summary. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sellerIdParam = searchParams.get("sellerId")?.trim();
  const usernameParam = searchParams.get("username")?.trim();
  if (!sellerIdParam && !usernameParam) {
    return NextResponse.json({ error: "sellerId or username is required." }, { status: 400 });
  }

  const select = { id: true, email: true } as const;
  const user = sellerIdParam
    ? await prisma.user.findFirst({ where: { id: sellerIdParam, suspendedAt: null }, select })
    : await prisma.user.findUnique({ where: { username: decodeURIComponent(usernameParam!) }, select });
  if (!user) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  const viewerId = await resolveOptionalListingsUserId(req);
  const viewer = viewerId
    ? await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } })
    : null;
  if (isHiddenFixtureSellerEmail(user.email) && viewerId !== user.id && viewer?.role !== "admin") {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }
  if (!(await viewerCanSeeUser(prisma, viewerId, user.id))) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }

  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [summary, reviews] = await Promise.all([
    loadSellerReviewSummary(prisma, user.id),
    loadSellerReviews(prisma, user.id, { take: PAGE_SIZE + 1, skip: (page - 1) * PAGE_SIZE }),
  ]);
  return NextResponse.json({
    summary,
    reviews: reviews.slice(0, PAGE_SIZE),
    page,
    hasMore: reviews.length > PAGE_SIZE,
  });
}
