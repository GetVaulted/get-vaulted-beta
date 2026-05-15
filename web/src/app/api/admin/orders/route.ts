import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const status = (new URL(req.url).searchParams.get("status") ?? "all").trim();

  const where: Prisma.OrderWhereInput = {};
  if (status !== "all" && status.length > 0) {
    where.status = status;
  }

  const rows = await prisma.order.findMany({
    where,
    include: {
      listing: { select: { id: true, title: true, status: true } },
      buyer: { select: { id: true, username: true, email: true } },
      seller: { select: { id: true, username: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    orders: rows.map((o) => ({
      id: o.id,
      status: o.status,
      totalUsd: o.totalUsd,
      itemPriceUsd: o.itemPriceUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      createdAt: o.createdAt.toISOString(),
      listingId: o.listingId,
      listingTitle: o.listing.title,
      listingStatus: o.listing.status,
      buyerId: o.buyerId,
      buyerUsername: o.buyer.username,
      sellerId: o.sellerId,
      sellerUsername: o.seller.username,
    })),
  });
}
