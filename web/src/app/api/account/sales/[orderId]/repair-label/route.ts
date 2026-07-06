import { NextResponse } from "next/server";
import { repairSellerOrderLabelFromShippo } from "@/lib/enrich-seller-order-label-from-shippo";
import { mapSellerSalesOrderForApi } from "@/lib/map-seller-sales-order";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function loadSellerOrder(orderId: string, sellerId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, ...sellerFulfillmentOrdersWhere(sellerId) },
    select: {
      id: true,
      shippoTransactionId: true,
      labelUrl: true,
      trackingNumber: true,
      trackingUrl: true,
      shippingStatus: true,
      fulfillmentStatus: true,
      labelCreatedAt: true,
    },
  });
}

/** Re-fetch label URL + tracking from Shippo when the DB row is incomplete. */
export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await resolveAccountSellerUserId(_req);
  if (auth instanceof NextResponse) return auth;

  const { orderId: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const order = await loadSellerOrder(orderId, auth.userId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const repaired = await repairSellerOrderLabelFromShippo(order);
  if (!repaired.ok) {
    return NextResponse.json(
      {
        error: `${repaired.error} Try Regenerate, or create the label again from Sales on desktop.`,
        repaired: false,
      },
      { status: 422 },
    );
  }

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

  const full = await prisma.order.findFirst({
    where: { id: orderId, sellerId: auth.userId },
    select: {
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
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          isCompanyListing: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { username: true } },
      layaway: { select: { status: true, remainingBalanceUsd: true } },
    },
  });
  if (!full) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    repaired: true,
    order: mapSellerSalesOrderForApi(user, full),
  });
}
