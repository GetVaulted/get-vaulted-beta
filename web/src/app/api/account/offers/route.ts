import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offers = await prisma.offer.findMany({
    where: { buyerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      listing: {
        include: {
          seller: { select: { username: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
    },
  });

  const listingIds = [...new Set(offers.map((o) => o.listingId))];
  const orders =
    listingIds.length === 0
      ? []
      : await prisma.order.findMany({
          where: { listingId: { in: listingIds } },
          select: { id: true, listingId: true },
        });
  const orderIdByListing = new Map(orders.map((o) => [o.listingId, o.id]));

  return NextResponse.json({
    offers: offers.map((o) => ({
      id: o.id,
      listingId: o.listingId,
      listingTitle: o.listing.title,
      listingThumb: o.listing.images[0]?.url ?? null,
      sellerUsername: o.listing.seller.username,
      amountUsd: o.amountUsd,
      message: o.message,
      status: o.status,
      counterAmountUsd: o.counterAmountUsd,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      orderId: orderIdByListing.get(o.listingId) ?? null,
    })),
  });
}
