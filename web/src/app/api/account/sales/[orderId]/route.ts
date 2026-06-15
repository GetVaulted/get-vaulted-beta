import { NextResponse } from "next/server";
import { enrichSellerOrderChargeBreakdown } from "@/lib/enrich-seller-order-charge-breakdown";
import { mapSellerSalesOrderForApi } from "@/lib/map-seller-sales-order";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ orderId: string }> };

const orderSelect = {
  id: true,
  buyerId: true,
  sellerId: true,
  totalUsd: true,
  itemPriceUsd: true,
  shippingPriceUsd: true,
  taxUsd: true,
  taxAmountCents: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  createdAt: true,
  shipRecipientName: true,
  shipAddress: true,
  shipCity: true,
  shipState: true,
  shipZip: true,
  shipCountry: true,
  carrier: true,
  service: true,
  trackingNumber: true,
  trackingUrl: true,
  labelUrl: true,
  shippoTransactionId: true,
  shippingStatus: true,
  labelCreatedAt: true,
  shippedAt: true,
  paymentDeadlineAt: true,
  payoutStatus: true,
  payoutBlockedReason: true,
  payoutHoldUntil: true,
  payoutReserveAmountCents: true,
  deliveryConfirmedAt: true,
  payoutMethod: true,
  stripeCheckoutSessionId: true,
  shippingChargedCents: true,
  liveShippingSession: {
    select: {
      liveShowId: true,
      liveShow: { select: { completedSalesGmvUsd: true, status: true } },
    },
  },
  listing: {
    select: {
      id: true,
      title: true,
      status: true,
      priceUsd: true,
      isCompanyListing: true,
      images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true } },
    },
  },
  buyer: { select: { username: true } },
  layaway: { select: { status: true, remainingBalanceUsd: true } },
} as const;

/** Seller order detail for mobile HQ (read-only; label purchase stays on web). */
export async function GET(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { orderId: rawId } = await ctx.params;
  const orderId = rawId?.trim();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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

  const order = await prisma.order.findFirst({
    where: { id: orderId, ...sellerFulfillmentOrdersWhere(auth.userId) },
    select: orderSelect,
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const enriched = await enrichSellerOrderChargeBreakdown(order);

  const activityLog = await prisma.sellerCommerceEvent.findMany({
    where: {
      sellerId: auth.userId,
      OR: [{ orderId: order.id }, { listingId: order.listing.id }],
    },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: { id: true, title: true, body: true, createdAt: true },
  });

  return NextResponse.json({
    order: mapSellerSalesOrderForApi(user, enriched),
    activityLog: activityLog.map((ev) => ({
      id: ev.id,
      title: ev.title,
      body: ev.body,
      createdAt: ev.createdAt.toISOString(),
    })),
  });
}
