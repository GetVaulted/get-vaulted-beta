import { NextResponse } from "next/server";
import { enrichSellerOrderChargeBreakdown } from "@/lib/enrich-seller-order-charge-breakdown";
import { liveShowFulfillmentOrderIds } from "@/lib/live-show-fulfillment-order-ids";
import { mapSellerSalesOrderForApi } from "@/lib/map-seller-sales-order";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { sellerInstantPayoutBannerMessage } from "@/lib/seller-payout-estimate";
import { prisma } from "@/lib/prisma";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { repairListingCommerceConflicts } from "@/services/layaway";

export async function GET(req: Request) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  await processAuctionPaymentExpiries();

  try {
    await repairListingCommerceConflicts();
  } catch (e) {
    console.error("[sales] repairListingCommerceConflicts", e);
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
      instantPayoutEligible: true,
      instantPayoutStatus: true,
      payoutTier: true,
      payoutHoldDays: true,
      payoutReservePercent: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const liveShowId = url.searchParams.get("liveShowId")?.trim() || null;
  const fulfillmentOrderIds = liveShowId ? await liveShowFulfillmentOrderIds(liveShowId) : [];

  const orders = await prisma.order.findMany({
    where: {
      ...sellerFulfillmentOrdersWhere(auth.userId),
      ...(liveShowId
        ? {
            OR: [
              { liveShippingSession: { liveShowId } },
              ...(fulfillmentOrderIds.length ? [{ id: { in: fulfillmentOrderIds } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
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
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true, title: true } },
        },
      },
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          priceUsd: true,
          isCompanyListing: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { username: true } },
      layaway: { select: { status: true, remainingBalanceUsd: true } },
    },
  });

  return NextResponse.json({
    sellerPayout: {
      instantPayoutEligible: user.instantPayoutEligible,
      instantPayoutStatus: user.instantPayoutStatus,
      payoutHoldDays: user.payoutHoldDays,
      payoutReservePercent: user.payoutReservePercent,
      payoutTier: user.payoutTier,
      eligibilityMessage: sellerInstantPayoutBannerMessage({
        instantPayoutEligible: user.instantPayoutEligible,
        instantPayoutStatus: user.instantPayoutStatus,
        payoutTier: user.payoutTier,
      }),
    },
    orders: await Promise.all(
      orders.map(async (o) => {
        const enriched = await enrichSellerOrderChargeBreakdown(o);
        return mapSellerSalesOrderForApi(user, enriched);
      }),
    ),
  });
}
