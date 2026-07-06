import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { processAuctionPaymentExpiries, reconcileBuyerPendingCheckoutSessions } from "@/services/payments";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  await processAuctionPaymentExpiries();
  try {
    await reconcileBuyerPendingCheckoutSessions(auth.userId);
  } catch (e) {
    console.error("[api/account/orders] reconcile checkout sessions", e);
  }

  const orders = await prisma.order.findMany({
    where: { buyerId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      totalUsd: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      carrier: true,
      trackingNumber: true,
      trackingUrl: true,
      shippedAt: true,
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

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      listingId: o.listingId,
      buyerId: o.buyerId,
      sellerId: o.sellerId,
      totalUsd: o.totalUsd,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      shippedAt: o.shippedAt?.toISOString() ?? null,
      seller: o.seller,
      listing: o.listing,
    })),
  });
}
