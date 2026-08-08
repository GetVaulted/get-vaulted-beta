import { prisma } from "@/lib/prisma";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import { OrderPayoutStatus } from "@/generated/prisma/enums";

/**
 * Order-level payout statuses that mean "something needs an admin's eyes" —
 * surfaced separately from the happy-path pending → paid_out flow.
 */
const NEEDS_ATTENTION_ORDER_STATUSES: OrderPayoutStatus[] = [
  OrderPayoutStatus.blocked,
  OrderPayoutStatus.manual_review,
];

const NEEDS_ATTENTION_PAYPAL_STATUSES = ["failed", "returned"];

export type AdminPayPalPayoutOrderRow = {
  orderId: string;
  itemTitle: string;
  estimatedNetUsd: number;
  createdAt: string;
  shippedAt: string | null;
  deliveryConfirmedAt: string | null;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutReleasedAt: string | null;
  paypalPayoutStatus: string | null;
  paypalPayoutFeeCents: number | null;
  processorTransferId: string | null;
  needsAttention: boolean;
};

export type AdminPayPalPayoutSellerRow = {
  sellerId: string;
  username: string | null;
  email: string | null;
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: string | null;
  orderCount: number;
  owedUsd: number;
  needsAttentionCount: number;
  blockedReason: string | null;
  orders: AdminPayPalPayoutOrderRow[];
};

export type AdminPayPalPayoutQueuePayload = {
  sellers: AdminPayPalPayoutSellerRow[];
  sellerCount: number;
  orderCount: number;
  totalOwedUsd: number;
  needsAttentionCount: number;
};

/**
 * Every order on the PayPal seller-payout rail (paid orders only), grouped by seller,
 * so an admin can see exactly where a PayPal-routed order stands instead of having to
 * open each order individually. Mirrors listSellersReadyForAdminBankPayout's shape for
 * the Stripe rail, but PayPal has no live "Connect balance" concept — everything here
 * comes straight off the Order row + the seller's verified PayPal email.
 */
export async function listPayPalPayoutQueue(limit = 300): Promise<AdminPayPalPayoutQueuePayload> {
  const rows = await prisma.order.findMany({
    where: {
      sellerPayoutProcessor: "PAYPAL",
      paymentStatus: "paid",
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(1000, Math.max(1, limit)),
    select: {
      id: true,
      sellerId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      referralCreditAppliedUsd: true,
      platformCreditAppliedUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      payoutBlockedReason: true,
      payoutReleasedAt: true,
      processorTransferId: true,
      paypalPayoutStatus: true,
      paypalPayoutFeeCents: true,
      shippedAt: true,
      deliveryConfirmedAt: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      liveShippingSessionId: true,
      createdAt: true,
      listing: { select: { title: true, isCompanyListing: true } },
      seller: {
        select: {
          username: true,
          email: true,
          paypalPayoutEmail: true,
          paypalPayoutVerifiedAt: true,
        },
      },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
  });

  const bySeller = new Map<
    string,
    {
      sellerId: string;
      username: string | null;
      email: string | null;
      paypalPayoutEmail: string | null;
      paypalPayoutVerifiedAt: string | null;
      orders: AdminPayPalPayoutOrderRow[];
    }
  >();

  let totalOwedUsd = 0;
  let needsAttentionCount = 0;

  for (const o of rows) {
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
      shippingLabelCostCents: o.shippingLabelCostCents ?? 0,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents ?? 0,
    });

    const isPaidOut =
      o.payoutStatus === OrderPayoutStatus.paid_out || Boolean(o.processorTransferId?.trim());
    const needsAttention =
      NEEDS_ATTENTION_ORDER_STATUSES.includes(o.payoutStatus) ||
      (Boolean(o.paypalPayoutStatus) &&
        NEEDS_ATTENTION_PAYPAL_STATUSES.includes((o.paypalPayoutStatus ?? "").toLowerCase()));

    if (needsAttention) needsAttentionCount += 1;
    if (!isPaidOut) totalOwedUsd += estimatedNetUsd;

    const row: AdminPayPalPayoutOrderRow = {
      orderId: o.id,
      itemTitle: o.listing.title,
      estimatedNetUsd,
      createdAt: o.createdAt.toISOString(),
      shippedAt: o.shippedAt?.toISOString() ?? null,
      deliveryConfirmedAt: o.deliveryConfirmedAt?.toISOString() ?? null,
      payoutStatus: o.payoutStatus,
      payoutBlockedReason: o.payoutBlockedReason,
      payoutReleasedAt: o.payoutReleasedAt?.toISOString() ?? null,
      paypalPayoutStatus: o.paypalPayoutStatus,
      paypalPayoutFeeCents: o.paypalPayoutFeeCents,
      processorTransferId: o.processorTransferId,
      needsAttention,
    };

    const cur = bySeller.get(o.sellerId);
    if (!cur) {
      bySeller.set(o.sellerId, {
        sellerId: o.sellerId,
        username: o.seller.username,
        email: o.seller.email,
        paypalPayoutEmail: o.seller.paypalPayoutEmail,
        paypalPayoutVerifiedAt: o.seller.paypalPayoutVerifiedAt?.toISOString() ?? null,
        orders: [row],
      });
    } else {
      cur.orders.push(row);
    }
  }

  const sellers: AdminPayPalPayoutSellerRow[] = [...bySeller.values()].map((g) => {
    const owedUsd = g.orders
      .filter((o) => o.payoutStatus !== OrderPayoutStatus.paid_out && !o.processorTransferId?.trim())
      .reduce((sum, o) => sum + o.estimatedNetUsd, 0);
    const emailReady = Boolean(g.paypalPayoutEmail?.trim()) && Boolean(g.paypalPayoutVerifiedAt);
    return {
      sellerId: g.sellerId,
      username: g.username,
      email: g.email,
      paypalPayoutEmail: g.paypalPayoutEmail,
      paypalPayoutVerifiedAt: g.paypalPayoutVerifiedAt,
      orderCount: g.orders.length,
      owedUsd: Math.round(owedUsd * 100) / 100,
      needsAttentionCount: g.orders.filter((o) => o.needsAttention).length,
      blockedReason: emailReady ? null : "paypal_email_not_verified",
      orders: g.orders,
    };
  });

  sellers.sort((a, b) => b.needsAttentionCount - a.needsAttentionCount || b.owedUsd - a.owedUsd);

  return {
    sellers,
    sellerCount: sellers.length,
    orderCount: rows.length,
    totalOwedUsd: Math.round(totalOwedUsd * 100) / 100,
    needsAttentionCount,
  };
}
