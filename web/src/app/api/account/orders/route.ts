import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { processAuctionPaymentExpiries } from "@/services/payments";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  await processAuctionPaymentExpiries();

  const orders = await prisma.order.findMany({
    where: { buyerId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      seller: { select: { username: true } },
    },
  });

  return NextResponse.json({ orders });
}
