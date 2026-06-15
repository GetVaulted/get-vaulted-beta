import { NextResponse } from "next/server";
import { enrichSellerOrderChargeBreakdown } from "@/lib/enrich-seller-order-charge-breakdown";
import { regenerateSellerOrderShippingLabel } from "@/lib/enrich-seller-order-label-from-shippo";
import { mapSellerSalesOrderForApi } from "@/lib/map-seller-sales-order";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Purchase a fresh Shippo label when the stored transaction has no printable file. */
export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await resolveAccountSellerUserId(_req);
  if (auth instanceof NextResponse) return auth;

  const { orderId: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const exists = await prisma.order.findFirst({
    where: { id: orderId, sellerId: auth.userId },
    select: { id: true, labelUrl: true },
  });
  if (!exists) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (exists.labelUrl?.trim()) {
    return NextResponse.json({ error: "A label file already exists for this order." }, { status: 409 });
  }

  try {
    await regenerateSellerOrderShippingLabel(orderId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ORDER_NOT_FOUND") return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (msg === "UNPAID") {
      return NextResponse.json({ error: "Order must be paid before creating a label." }, { status: 409 });
    }
    if (msg === "LABEL_EXISTS") {
      return NextResponse.json({ error: "A label file already exists for this order." }, { status: 409 });
    }
    console.error("[regenerate-label]", e);
    return NextResponse.json({ error: msg || "Could not regenerate label." }, { status: 500 });
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

  const order = await prisma.order.findFirst({
    where: { id: orderId, ...sellerFulfillmentOrdersWhere(auth.userId) },
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
          isCompanyListing: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { username: true } },
      layaway: { select: { status: true, remainingBalanceUsd: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const enriched = await enrichSellerOrderChargeBreakdown(order);

  return NextResponse.json({ ok: true, order: mapSellerSalesOrderForApi(user, enriched) });
}
