import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import {
  parseReviewInput,
  reviewBlockMessage,
  reviewEligibility,
} from "@/lib/seller-reviews";

const orderSelect = {
  id: true,
  buyerId: true,
  sellerId: true,
  paymentStatus: true,
  status: true,
  fulfillmentStatus: true,
  deliveryConfirmedAt: true,
  listing: { select: { title: true } },
  sellerReview: { select: { id: true, rating: true, body: true, tags: true, createdAt: true } },
} as const;

async function loadOrder(orderId: string, userId: string) {
  // Buyers see their own order; anyone else gets the same 404 as a missing order.
  return prisma.order.findFirst({ where: { id: orderId, buyerId: userId }, select: orderSelect });
}

/** Can the signed-in buyer review this order, and what did they already write? */
export async function GET(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { orderId: raw } = await ctx.params;
  const order = await loadOrder(decodeURIComponent(raw), auth.userId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const eligibility = reviewEligibility(order, auth.userId, order.sellerReview != null);
  return NextResponse.json({
    canReview: eligibility.canReview,
    reason: eligibility.reason,
    message: eligibility.reason ? reviewBlockMessage(eligibility.reason) : null,
    review: order.sellerReview
      ? { ...order.sellerReview, createdAt: order.sellerReview.createdAt.toISOString() }
      : null,
  });
}

/** Leave the one review for this order (verified buyer, delivered order). */
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { orderId: raw } = await ctx.params;
  const order = await loadOrder(decodeURIComponent(raw), auth.userId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewInput(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const eligibility = reviewEligibility(order, auth.userId, order.sellerReview != null);
  if (!eligibility.canReview) {
    return NextResponse.json(
      { error: reviewBlockMessage(eligibility.reason), reason: eligibility.reason },
      { status: eligibility.reason === "already_reviewed" ? 409 : 403 },
    );
  }

  let review;
  try {
    review = await prisma.sellerReview.create({
      data: {
        orderId: order.id,
        sellerId: order.sellerId,
        buyerId: auth.userId,
        rating: parsed.value.rating,
        body: parsed.value.body,
        tags: parsed.value.tags,
      },
      select: { id: true, rating: true, body: true, tags: true, createdAt: true },
    });
  } catch (e) {
    // Two taps at once: the unique index on orderId makes the second one a clean 409.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: reviewBlockMessage("already_reviewed"), reason: "already_reviewed" },
        { status: 409 },
      );
    }
    throw e;
  }

  const [buyer, seller] = await Promise.all([
    prisma.user.findUnique({ where: { id: auth.userId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: order.sellerId }, select: { username: true } }),
  ]);
  if (seller) {
    void createNotification(prisma, {
      userId: order.sellerId,
      type: "seller_review",
      title: "New review",
      body: `@${buyer?.username ?? "A buyer"} left ${review.rating} star${review.rating === 1 ? "" : "s"} on ${order.listing.title}.`,
      href: `/seller/${encodeURIComponent(seller.username)}`,
    });
  }

  return NextResponse.json(
    { review: { ...review, createdAt: review.createdAt.toISOString() } },
    { status: 201 },
  );
}
