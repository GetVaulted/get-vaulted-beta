import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import {
  orderLabelClawbackSettledForBankPayout,
  orderLooksShippedForBankPayout,
} from "@/services/payout/stripe-seller-payout";

/** Orders waiting for an admin to push the Stripe bank payout. */
export const ADMIN_BANK_PAYOUT_READY_STATUSES: OrderPayoutStatus[] = [
  OrderPayoutStatus.fast_payout_ready,
  OrderPayoutStatus.label_payout_ready,
  OrderPayoutStatus.instant_payout_ready,
];

export type AdminBankPayoutReadyRow = {
  orderId: string;
  sellerId: string;
  sellerUsername: string | null;
  sellerEmail: string | null;
  itemTitle: string;
  itemPriceUsd: number;
  estimatedNetUsd: number;
  payoutStatus: string;
  shippedAt: string | null;
  carrierAcceptedAt: string | null;
  labelCostCents: number;
  labelReversedCents: number;
  liveShippingSessionId: string | null;
  createdAt: string;
};

export async function countOrdersReadyForAdminBankPayout(): Promise<number> {
  return prisma.order.count({
    where: {
      paymentStatus: "paid",
      sellerPayoutProcessor: { not: "PAYPAL" },
      payoutStatus: { in: ADMIN_BANK_PAYOUT_READY_STATUSES },
      OR: [
        { shippedAt: { not: null } },
        { carrierAcceptedAt: { not: null } },
        { fulfillmentStatus: { in: ["shipped", "in_transit", "out_for_delivery", "delivered"] } },
        { status: { in: ["shipped", "delivered"] } },
      ],
    },
  });
}

export async function listOrdersReadyForAdminBankPayout(limit = 100): Promise<AdminBankPayoutReadyRow[]> {
  const rows = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      sellerPayoutProcessor: { not: "PAYPAL" },
      payoutStatus: { in: ADMIN_BANK_PAYOUT_READY_STATUSES },
      OR: [
        { shippedAt: { not: null } },
        { carrierAcceptedAt: { not: null } },
        { fulfillmentStatus: { in: ["shipped", "in_transit", "out_for_delivery", "delivered"] } },
        { status: { in: ["shipped", "delivered"] } },
      ],
    },
    orderBy: [{ shippedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(200, Math.max(1, limit)),
    select: {
      id: true,
      sellerId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      shippedAt: true,
      carrierAcceptedAt: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippoTransactionId: true,
      labelUrl: true,
      liveShippingSessionId: true,
      createdAt: true,
      listing: { select: { title: true, isCompanyListing: true } },
      seller: { select: { username: true, email: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
  });

  return rows
    .filter((o) =>
      orderLooksShippedForBankPayout(o) && orderLabelClawbackSettledForBankPayout(o),
    )
    .map((o) => {
      const saleBasisUsd = orderItemSaleBasisUsd(o);
      const liveShow = o.liveShippingSession?.liveShow ?? null;
      const feePct = resolvePlatformFeePercentForSellerOrder({
        isCompanyListing: o.listing.isCompanyListing,
        liveShowId: o.liveShippingSession?.liveShowId ?? null,
        liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
        orderItemPriceUsd: saleBasisUsd,
        orderPaymentStatus: o.paymentStatus,
      });
      const estimatedNetUsd = estimateSellerOrderPayoutUsd({
        itemPriceUsd: saleBasisUsd,
        shippingPriceUsd: o.shippingPriceUsd,
        platformFeePercent: feePct,
        payoutReserveAmountCents: 0,
        shippingLabelCostCents: o.shippingLabelCostCents,
        shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      });
      return {
        orderId: o.id,
        sellerId: o.sellerId,
        sellerUsername: o.seller.username,
        sellerEmail: o.seller.email,
        itemTitle: o.listing.title,
        itemPriceUsd: o.itemPriceUsd,
        estimatedNetUsd,
        payoutStatus: o.payoutStatus,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        carrierAcceptedAt: o.carrierAcceptedAt?.toISOString() ?? null,
        labelCostCents: o.shippingLabelCostCents,
        labelReversedCents: o.shippingLabelCostReversedCents,
        liveShippingSessionId: o.liveShippingSessionId,
        createdAt: o.createdAt.toISOString(),
      };
    });
}
