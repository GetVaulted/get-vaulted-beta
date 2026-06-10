import { NextResponse } from "next/server";
import { sellerNextActionForOrder } from "@/lib/seller-fulfillment-next-action";
import { sellerFulfillmentOrdersWhere } from "@/lib/seller-fulfillment-orders";
import { resolveOrderCommerceSnapshot } from "@/lib/marketplace/commerce-state";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
  sellerInstantPayoutBannerMessage,
} from "@/lib/seller-payout-estimate";
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

  const orders = await prisma.order.findMany({
    where: sellerFulfillmentOrdersWhere(auth.userId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      totalUsd: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
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
      payoutStatus: true,
      payoutBlockedReason: true,
      payoutHoldUntil: true,
      payoutReserveAmountCents: true,
      deliveryConfirmedAt: true,
      payoutMethod: true,
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
    orders: orders.map((o) => {
      const liveShowId = o.liveShippingSession?.liveShowId ?? null;
      const liveShow = o.liveShippingSession?.liveShow;
      const platformFeePercent = resolvePlatformFeePercentForSellerOrder({
        isCompanyListing: Boolean(o.listing.isCompanyListing),
        liveShowId,
        liveShowCompletedGmvUsd: liveShow?.status === "live" ? liveShow.completedSalesGmvUsd : null,
        orderItemPriceUsd: o.itemPriceUsd,
        orderPaymentStatus: o.paymentStatus,
      });
      const commerce = resolveOrderCommerceSnapshot({
        id: o.id,
        listingId: o.listing.id,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        status: o.status,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        trackingNumber: o.trackingNumber,
        listingStatus: o.listing.status,
        layawayStatus: o.layaway?.status ?? null,
        remainingBalanceUsd: o.layaway?.remainingBalanceUsd ?? null,
      });
      return {
      id: o.id,
      totalUsd: o.totalUsd,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      commerceBucket: commerce.sellerBucket,
      createdAt: o.createdAt.toISOString(),
      shipCity: o.shipCity,
      shipState: o.shipState,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      labelUrl: o.labelUrl,
      shippoTransactionId: o.shippoTransactionId,
      paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
      payoutStatus: o.payoutStatus,
      payoutBlockedReason: o.payoutBlockedReason,
      payoutHoldUntil: o.payoutHoldUntil?.toISOString() ?? null,
      payoutReserveAmountCents: o.payoutReserveAmountCents,
      deliveryConfirmedAt: o.deliveryConfirmedAt?.toISOString() ?? null,
      payoutMethod: o.payoutMethod,
      platformFeePercent,
      payoutEstimateUsd: estimateSellerOrderPayoutUsd({
        itemPriceUsd: o.itemPriceUsd,
        shippingPriceUsd: o.shippingPriceUsd,
        payoutReserveAmountCents: o.payoutReserveAmountCents,
        platformFeePercent,
      }),
      listing: o.listing,
      buyer: o.buyer,
      sellerNextAction: sellerNextActionForOrder(user, o).label,
    };
    }),
  });
}
