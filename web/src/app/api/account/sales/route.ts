import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { sellerNextActionForOrder } from "@/lib/seller-fulfillment-next-action";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
  sellerInstantPayoutBannerMessage,
} from "@/lib/seller-payout-estimate";
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
      instantPayoutEligible: true,
      instantPayoutStatus: true,
      payoutHoldDays: true,
      payoutReservePercent: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await prisma.order.findMany({
    where: { sellerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
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
    },
  });

  return NextResponse.json({
    sellerPayout: {
      instantPayoutEligible: user.instantPayoutEligible,
      instantPayoutStatus: user.instantPayoutStatus,
      payoutHoldDays: user.payoutHoldDays,
      payoutReservePercent: user.payoutReservePercent,
      eligibilityMessage: sellerInstantPayoutBannerMessage({
        instantPayoutEligible: user.instantPayoutEligible,
        instantPayoutStatus: user.instantPayoutStatus,
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
      return {
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
