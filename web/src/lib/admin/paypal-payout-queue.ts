import { prisma } from "@/lib/prisma";
import {
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { paypalRailSellerProcessingFeeUsd } from "@/lib/paypal-rail-processing-fee";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { getOutstandingLiabilityCentsBySeller } from "@/services/shipping/label-liability-recovery";

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
  /** Processing fee already subtracted from `estimatedNetUsd` (seller-absorbed). */
  processingFeeUsd: number;
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
  /** Gross estimated payout across this seller's not-yet-paid orders (platform fee + shipping + label cost already applied). */
  owedUsd: number;
  /**
   * Outstanding Get Vaulted shipping-label liability (unpaid clawbacks) this seller carries.
   * Not included in `owedUsd` above — it is only ever deducted at the moment a payout actually
   * goes out (automated release, or an admin "mark paid" settlement). This is what a manual,
   * off-platform payment should subtract before sending, or that recovery opportunity is lost.
   */
  outstandingLiabilityUsd: number;
  /** `owedUsd` minus `outstandingLiabilityUsd`, floored at 0 — the actual amount safe to send. */
  netOfLiabilityUsd: number;
  needsAttentionCount: number;
  blockedReason: string | null;
  /** Orders for this seller already settled (paid out / marked paid) — shown for context only. */
  paidOutOrderCount: number;
  /** Open partial payments already sent to this seller (off-platform), in USD. */
  partialPaidUsd: number;
  /** What is still left to send: `netOfLiabilityUsd` minus open partial payments, floored at 0. */
  remainingUsd: number;
  partialPayments: { id: string; amountUsd: number; note: string | null; createdAt: string }[];
  orders: AdminPayPalPayoutOrderRow[];
};

export type AdminPayPalPayoutQueuePayload = {
  sellers: AdminPayPalPayoutSellerRow[];
  sellerCount: number;
  orderCount: number;
  totalOwedUsd: number;
  /** Sum of every seller's `remainingUsd` — the real amount left to send. */
  totalRemainingUsd: number;
  needsAttentionCount: number;
};

/** Sum of each seller's open (not settled, not voided) partial payments, in cents. */
export async function getOpenPartialPaymentCentsBySeller(sellerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sellerIds.length === 0) return out;
  const rows = await prisma.sellerPayPalPartialPayment.groupBy({
    by: ["sellerId"],
    where: { sellerId: { in: sellerIds }, settledAt: null, voidedAt: null },
    _sum: { amountCents: true },
  });
  for (const r of rows) out.set(r.sellerId, r._sum.amountCents ?? 0);
  return out;
}

/**
 * Every order on the PayPal seller-payout rail (paid orders only), grouped by seller,
 * so an admin can see exactly where a PayPal-routed order stands instead of having to
 * open each order individually. Mirrors listSellersReadyForAdminBankPayout's shape for
 * the Stripe rail, but PayPal has no live "Connect balance" concept — everything here
 * comes straight off the Order row + the seller's verified PayPal email.
 */
export async function listPayPalPayoutQueue(
  limit = 5000,
  opts: { sellerId?: string } = {},
): Promise<AdminPayPalPayoutQueuePayload> {
  // Only orders that still need paying. (This used to load the newest 300 of ALL paid orders,
  // including already-settled ones, which silently dropped older unpaid orders from the totals.)
  const rows = await prisma.order.findMany({
    where: {
      sellerPayoutProcessor: "PAYPAL",
      paymentStatus: "paid",
      payoutStatus: { not: OrderPayoutStatus.paid_out },
      processorTransferId: null,
      ...(opts.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(10000, Math.max(1, limit)),
    select: {
      id: true,
      sellerId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      totalUsd: true,
      stripeProcessingFeeCents: true,
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
    const processingFeeUsd = paypalRailSellerProcessingFeeUsd(o);
    const estimatedNetUsd = estimateSellerOrderPayoutUsd({
      itemPriceUsd: saleBasisUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      platformFeePercent: feePct,
      payoutReserveAmountCents: 0,
      shippingLabelCostCents: o.shippingLabelCostCents ?? 0,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents ?? 0,
      stripeProcessingFeeUsd: processingFeeUsd,
    });

    const isPaidOut =
      o.payoutStatus === OrderPayoutStatus.paid_out || Boolean(o.processorTransferId?.trim());
    // A seller without a verified PayPal email can't actually receive a payout — flag any of their
    // still-owed orders as needing attention too, not just ones with a blocked/failed order status.
    const sellerEmailReady =
      Boolean(o.seller.paypalPayoutEmail?.trim()) && Boolean(o.seller.paypalPayoutVerifiedAt);
    const needsAttention =
      NEEDS_ATTENTION_ORDER_STATUSES.includes(o.payoutStatus) ||
      (Boolean(o.paypalPayoutStatus) &&
        NEEDS_ATTENTION_PAYPAL_STATUSES.includes((o.paypalPayoutStatus ?? "").toLowerCase())) ||
      (!sellerEmailReady && !isPaidOut);

    if (needsAttention) needsAttentionCount += 1;
    if (!isPaidOut) totalOwedUsd += estimatedNetUsd;

    const row: AdminPayPalPayoutOrderRow = {
      orderId: o.id,
      itemTitle: o.listing.title,
      estimatedNetUsd,
      processingFeeUsd,
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

  const sellerIds = [...bySeller.keys()];
  const outstandingLiabilityBySeller = await getOutstandingLiabilityCentsBySeller(sellerIds);
  const partialCentsBySeller = await getOpenPartialPaymentCentsBySeller(sellerIds);
  const partialRows = sellerIds.length
    ? await prisma.sellerPayPalPartialPayment.findMany({
        where: { sellerId: { in: sellerIds }, settledAt: null, voidedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, sellerId: true, amountCents: true, note: true, createdAt: true },
      })
    : [];
  const paidOutCounts = sellerIds.length
    ? await prisma.order.groupBy({
        by: ["sellerId"],
        where: {
          sellerId: { in: sellerIds },
          sellerPayoutProcessor: "PAYPAL",
          paymentStatus: "paid",
          OR: [{ payoutStatus: OrderPayoutStatus.paid_out }, { processorTransferId: { not: null } }],
        },
        _count: { _all: true },
      })
    : [];
  const paidOutBySeller = new Map<string, number>(paidOutCounts.map((r) => [r.sellerId, r._count._all] as [string, number]));

  const sellers: AdminPayPalPayoutSellerRow[] = [...bySeller.values()].map((g) => {
    const owedUsd = g.orders
      .filter((o) => o.payoutStatus !== OrderPayoutStatus.paid_out && !o.processorTransferId?.trim())
      .reduce((sum, o) => sum + o.estimatedNetUsd, 0);
    const emailReady = Boolean(g.paypalPayoutEmail?.trim()) && Boolean(g.paypalPayoutVerifiedAt);
    const owedUsdRounded = Math.round(owedUsd * 100) / 100;
    const outstandingLiabilityUsd =
      Math.round((outstandingLiabilityBySeller.get(g.sellerId) ?? 0)) / 100;
    const netOfLiabilityUsd = Math.max(0, Math.round((owedUsdRounded - outstandingLiabilityUsd) * 100) / 100);
    const partialPaidCents = partialCentsBySeller.get(g.sellerId) ?? 0;
    const remainingUsd = Math.max(0, Math.round(netOfLiabilityUsd * 100 - partialPaidCents) / 100);
    return {
      sellerId: g.sellerId,
      username: g.username,
      email: g.email,
      paypalPayoutEmail: g.paypalPayoutEmail,
      paypalPayoutVerifiedAt: g.paypalPayoutVerifiedAt,
      orderCount: g.orders.length,
      owedUsd: owedUsdRounded,
      outstandingLiabilityUsd,
      netOfLiabilityUsd,
      needsAttentionCount: g.orders.filter((o) => o.needsAttention).length,
      blockedReason: emailReady ? null : "paypal_email_not_verified",
      paidOutOrderCount: paidOutBySeller.get(g.sellerId) ?? 0,
      partialPaidUsd: partialPaidCents / 100,
      remainingUsd,
      partialPayments: partialRows
        .filter((r) => r.sellerId === g.sellerId)
        .map((r) => ({
          id: r.id,
          amountUsd: r.amountCents / 100,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        })),
      orders: g.orders,
    };
  });

  sellers.sort((a, b) => b.needsAttentionCount - a.needsAttentionCount || b.owedUsd - a.owedUsd);

  return {
    sellers,
    sellerCount: sellers.length,
    orderCount: rows.length,
    totalOwedUsd: Math.round(totalOwedUsd * 100) / 100,
    totalRemainingUsd: Math.round(sellers.reduce((sum, x) => sum + x.remainingUsd, 0) * 100) / 100,
    needsAttentionCount,
  };
}

/** One seller's balance, computed exactly like the queue page (used to validate partial payments). */
export async function getPayPalSellerBalance(sellerId: string): Promise<AdminPayPalPayoutSellerRow | null> {
  const payload = await listPayPalPayoutQueue(5000, { sellerId });
  return payload.sellers[0] ?? null;
}
