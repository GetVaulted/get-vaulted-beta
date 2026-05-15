import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { sellerNextActionForOrder } from "@/lib/seller-fulfillment-next-action";
import { prisma } from "@/lib/prisma";
import { processAuctionPaymentExpiries } from "@/services/payments";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await processAuctionPaymentExpiries();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await prisma.order.findMany({
    where: { sellerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalUsd: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      createdAt: true,
      shipCity: true,
      shipState: true,
      trackingNumber: true,
      trackingUrl: true,
      labelUrl: true,
      shippoTransactionId: true,
      paymentDeadlineAt: true,
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { username: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      totalUsd: o.totalUsd,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      createdAt: o.createdAt.toISOString(),
      shipCity: o.shipCity,
      shipState: o.shipState,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      labelUrl: o.labelUrl,
      shippoTransactionId: o.shippoTransactionId,
      paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
      listing: o.listing,
      buyer: o.buyer,
      sellerNextAction: sellerNextActionForOrder(user, o).label,
    })),
  });
}
