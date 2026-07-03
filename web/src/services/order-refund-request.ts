import {
  OrderRefundRequestKind,
  OrderRefundRequestStatus,
  OrderPaymentMethod,
} from "@/generated/prisma/enums";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { createNotification } from "@/lib/notifications";
import {
  ACTIVE_REFUND_REQUEST_STATUSES,
  resolveLiveOrderRefundEligibility,
  type LiveOrderRefundKind,
} from "@/lib/order-refund-eligibility";
import { reverseLiveShowCompletedSaleTx } from "@/lib/live-show-gmv";
import { serializeOrderRefundRequest, type OrderRefundRequestDto } from "@/lib/order-refund-types";
import { fullRefundAmountCents } from "@/lib/sales-tax-charge";
import { prisma } from "@/lib/prisma";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { removeOrderFromLiveShippingSessionOnRefundTx } from "@/services/shipping/live-shipping-pricing";
import { PAYMENT_REFUNDED } from "@/services/payments";

export type { OrderRefundRequestDto } from "@/lib/order-refund-types";
export { serializeOrderRefundRequest } from "@/lib/order-refund-types";

const ORDER_SELECT = {
  id: true,
  buyerId: true,
  sellerId: true,
  listingId: true,
  paymentStatus: true,
  paymentMethod: true,
  status: true,
  fulfillmentStatus: true,
  shippedAt: true,
  deliveryConfirmedAt: true,
  stripePaymentIntentId: true,
  totalUsd: true,
  liveShippingSession: { select: { liveShowId: true } },
  listing: { select: { title: true } },
} as const;

function trimStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function normalizePhotoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && u.length <= 2000)
    .slice(0, 6);
}

async function loadOrderForRefund(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: ORDER_SELECT,
  });
}

function gateInputFromOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrderForRefund>>>) {
  return {
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    shippedAt: order.shippedAt,
    deliveryConfirmedAt: order.deliveryConfirmedAt,
    liveShowId: order.liveShippingSession?.liveShowId ?? null,
  };
}

async function getActiveRefundRequest(orderId: string) {
  const activeStatuses = [...ACTIVE_REFUND_REQUEST_STATUSES] as OrderRefundRequestStatus[];
  return prisma.orderRefundRequest.findFirst({
    where: {
      orderId,
      status: { in: activeStatuses },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getLatestRefundRequest(orderId: string) {
  return prisma.orderRefundRequest.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

function listingTitleShort(title: string): string {
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

export async function getOrderRefundRequestState(orderId: string) {
  const order = await loadOrderForRefund(orderId);
  if (!order) return null;
  const eligibility = resolveLiveOrderRefundEligibility(gateInputFromOrder(order));
  const request = await getLatestRefundRequest(orderId);
  return {
    eligibility,
    request: request ? serializeOrderRefundRequest(request) : null,
    liveShowId: order.liveShippingSession?.liveShowId ?? null,
  };
}

export async function createBuyerRefundRequest(args: {
  orderId: string;
  buyerId: string;
  kind: LiveOrderRefundKind;
  reason: string;
  photoUrls?: unknown;
}) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.buyerId !== args.buyerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const eligibility = resolveLiveOrderRefundEligibility(gateInputFromOrder(order));
  if (!eligibility.kind) {
    throw new RefundRequestError(eligibility.blockedReason ?? "NOT_ELIGIBLE", 400);
  }
  if (eligibility.kind !== args.kind) {
    throw new RefundRequestError("KIND_MISMATCH", 400);
  }

  const reason = trimStr(args.reason, 2000);
  if (reason.length < 3) {
    throw new RefundRequestError("REASON_REQUIRED", 400);
  }

  const photoUrls = normalizePhotoUrls(args.photoUrls);
  if (args.kind === "return" && photoUrls.length === 0) {
    throw new RefundRequestError("PHOTOS_REQUIRED", 400);
  }

  const active = await getActiveRefundRequest(args.orderId);
  if (active) {
    throw new RefundRequestError("REQUEST_ALREADY_OPEN", 409);
  }

  const row = await prisma.orderRefundRequest.create({
    data: {
      orderId: args.orderId,
      kind: args.kind === "cancel" ? OrderRefundRequestKind.cancel : OrderRefundRequestKind.return,
      status: OrderRefundRequestStatus.pending_seller,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      reason,
      photoUrls,
    },
  });

  const lt = listingTitleShort(order.listing.title);
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "order_refund_request",
    title: args.kind === "cancel" ? "Cancel request" : "Return request",
    body: `A buyer requested a ${args.kind === "cancel" ? "cancel/refund" : "return/refund"} for “${lt}”.`,
    href: `/account/sales/${encodeURIComponent(order.id)}`,
  });
  await logSellerCommerceEvent({
    sellerId: order.sellerId,
    listingId: order.listingId,
    orderId: order.id,
    kind: SELLER_COMMERCE_KIND.orderRefundRequested,
    title: args.kind === "cancel" ? "Cancel requested" : "Return requested",
    body: `Buyer requested a ${args.kind} for “${lt}”.`,
  });

  return serializeOrderRefundRequest(row);
}

export async function sellerDirectCancelRefund(args: { orderId: string; sellerId: string; reason?: string }) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.sellerId !== args.sellerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const eligibility = resolveLiveOrderRefundEligibility(gateInputFromOrder(order));
  if (eligibility.kind !== "cancel") {
    throw new RefundRequestError(eligibility.blockedReason ?? "NOT_ELIGIBLE", 400);
  }

  const active = await getActiveRefundRequest(args.orderId);
  if (active) {
    throw new RefundRequestError("REQUEST_ALREADY_OPEN", 409);
  }

  const reason = trimStr(args.reason, 2000) || "Seller cancelled and refunded this order.";
  const audit = await prisma.orderRefundRequest.create({
    data: {
      orderId: args.orderId,
      kind: OrderRefundRequestKind.cancel,
      status: OrderRefundRequestStatus.pending_seller,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      reason,
      sellerDirect: true,
    },
  });

  await executeOrderRefund(args.orderId, audit.id);
  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: audit.id } });
  return serializeOrderRefundRequest(updated);
}

export async function sellerRespondToRefundRequest(args: {
  orderId: string;
  sellerId: string;
  approve: boolean;
  denyReason?: string;
}) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.sellerId !== args.sellerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const req = await prisma.orderRefundRequest.findFirst({
    where: { orderId: args.orderId, status: OrderRefundRequestStatus.pending_seller },
    orderBy: { createdAt: "desc" },
  });
  if (!req) {
    throw new RefundRequestError("NO_PENDING_REQUEST", 404);
  }

  const lt = listingTitleShort(order.listing.title);
  const now = new Date();

  if (args.approve) {
    if (req.kind === OrderRefundRequestKind.cancel) {
      await executeOrderRefund(args.orderId, req.id);
    } else {
      await prisma.orderRefundRequest.update({
        where: { id: req.id },
        data: {
          status: OrderRefundRequestStatus.awaiting_return,
          sellerRespondedAt: now,
        },
      });
      await createNotification(prisma, {
        userId: order.buyerId,
        type: "order_refund_approved",
        title: "Return approved",
        body: `Your return for “${lt}” was approved. Ship the item back (you pay return shipping) and add tracking on the order page.`,
        href: `/orders/${encodeURIComponent(order.id)}`,
      });
    }
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.orderRefundApproved,
      title: req.kind === OrderRefundRequestKind.cancel ? "Cancel approved" : "Return approved",
      body: `You approved the buyer’s ${req.kind} request for “${lt}”.`,
    });
  } else {
    const denyReason = trimStr(args.denyReason, 2000);
    if (denyReason.length < 3) {
      throw new RefundRequestError("DENY_REASON_REQUIRED", 400);
    }
    await prisma.orderRefundRequest.update({
      where: { id: req.id },
      data: {
        status: OrderRefundRequestStatus.seller_denied,
        sellerDenyReason: denyReason,
        sellerRespondedAt: now,
      },
    });
    await createNotification(prisma, {
      userId: order.buyerId,
      type: "order_refund_denied",
      title: "Request denied",
      body: `Your ${req.kind === OrderRefundRequestKind.cancel ? "cancel" : "return"} request for “${lt}” was denied. You can escalate to Get Vaulted support.`,
      href: `/orders/${encodeURIComponent(order.id)}`,
    });
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.orderRefundDenied,
      title: "Refund request denied",
      body: `You denied the buyer’s ${req.kind} request for “${lt}”.`,
    });
  }

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}

export async function buyerEscalateRefundRequest(args: { orderId: string; buyerId: string }) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.buyerId !== args.buyerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const req = await prisma.orderRefundRequest.findFirst({
    where: { orderId: args.orderId, status: OrderRefundRequestStatus.seller_denied },
    orderBy: { createdAt: "desc" },
  });
  if (!req) {
    throw new RefundRequestError("NOT_ESCALATABLE", 400);
  }

  await prisma.orderRefundRequest.update({
    where: { id: req.id },
    data: {
      status: OrderRefundRequestStatus.escalated,
      escalatedAt: new Date(),
    },
  });

  const lt = listingTitleShort(order.listing.title);
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "order_refund_escalated",
    title: "Support review",
    body: `The buyer escalated a refund request for “${lt}” to Get Vaulted support.`,
    href: `/account/sales/${encodeURIComponent(order.id)}`,
  });

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}

export async function buyerSubmitReturnTracking(args: {
  orderId: string;
  buyerId: string;
  trackingNumber: string;
  carrier?: string;
}) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.buyerId !== args.buyerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const req = await prisma.orderRefundRequest.findFirst({
    where: {
      orderId: args.orderId,
      status: { in: [OrderRefundRequestStatus.awaiting_return, OrderRefundRequestStatus.return_in_transit] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!req || req.kind !== OrderRefundRequestKind.return) {
    throw new RefundRequestError("NO_RETURN_APPROVED", 400);
  }

  const trackingNumber = trimStr(args.trackingNumber, 120);
  if (trackingNumber.length < 3) {
    throw new RefundRequestError("TRACKING_REQUIRED", 400);
  }

  await prisma.orderRefundRequest.update({
    where: { id: req.id },
    data: {
      status: OrderRefundRequestStatus.return_in_transit,
      returnTrackingNumber: trackingNumber,
      returnCarrier: trimStr(args.carrier, 80) || null,
    },
  });

  const lt = listingTitleShort(order.listing.title);
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "order_return_shipped",
    title: "Return shipped",
    body: `The buyer shipped their return for “${lt}”. Tracking: ${trackingNumber}.`,
    href: `/account/sales/${encodeURIComponent(order.id)}`,
  });

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}

export async function sellerConfirmReturnReceived(args: { orderId: string; sellerId: string }) {
  const order = await loadOrderForRefund(args.orderId);
  if (!order || order.sellerId !== args.sellerId) {
    throw new RefundRequestError("NOT_FOUND", 404);
  }

  const req = await prisma.orderRefundRequest.findFirst({
    where: {
      orderId: args.orderId,
      kind: OrderRefundRequestKind.return,
      status: { in: [OrderRefundRequestStatus.return_in_transit, OrderRefundRequestStatus.awaiting_return] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!req) {
    throw new RefundRequestError("NO_RETURN_IN_PROGRESS", 400);
  }

  await prisma.orderRefundRequest.update({
    where: { id: req.id },
    data: { returnReceivedAt: new Date() },
  });

  await executeOrderRefund(args.orderId, req.id);

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}

export async function supportResolveRefundRequest(args: {
  requestId: string;
  adminUserId: string;
  approve: boolean;
  note?: string;
}) {
  const req = await prisma.orderRefundRequest.findUnique({
    where: { id: args.requestId },
    include: {
      order: {
        select: ORDER_SELECT,
      },
    },
  });
  if (!req || req.status !== OrderRefundRequestStatus.escalated) {
    throw new RefundRequestError("NOT_ESCALATED", 404);
  }

  const order = req.order;
  const lt = listingTitleShort(order.listing.title);
  const note = trimStr(args.note, 2000) || null;
  const now = new Date();

  if (args.approve) {
    if (req.kind === OrderRefundRequestKind.cancel) {
      await prisma.orderRefundRequest.update({
        where: { id: req.id },
        data: { supportNote: note, supportResolvedAt: now },
      });
      await executeOrderRefund(order.id, req.id);
    } else {
      await prisma.orderRefundRequest.update({
        where: { id: req.id },
        data: {
          status: OrderRefundRequestStatus.awaiting_return,
          supportNote: note,
          supportResolvedAt: now,
        },
      });
      await createNotification(prisma, {
        userId: order.buyerId,
        type: "order_refund_support_approved",
        title: "Support approved return",
        body: `Get Vaulted support approved your return for “${lt}”. Ship the item back and add tracking.`,
        href: `/orders/${encodeURIComponent(order.id)}`,
      });
      await createNotification(prisma, {
        userId: order.sellerId,
        type: "order_refund_support_approved_seller",
        title: "Support approved return",
        body: `Support sided with the buyer on the return for “${lt}”.`,
        href: `/account/sales/${encodeURIComponent(order.id)}`,
      });
    }
  } else {
    await prisma.orderRefundRequest.update({
      where: { id: req.id },
      data: {
        status: OrderRefundRequestStatus.support_denied,
        supportNote: note,
        supportResolvedAt: now,
      },
    });
    await createNotification(prisma, {
      userId: order.buyerId,
      type: "order_refund_support_denied",
      title: "Support denied request",
      body: `Get Vaulted support reviewed your request for “${lt}” and did not approve a refund.`,
      href: `/orders/${encodeURIComponent(order.id)}`,
    });
    await createNotification(prisma, {
      userId: order.sellerId,
      type: "order_refund_support_denied_seller",
      title: "Support denied request",
      body: `Support closed the escalated refund request for “${lt}”.`,
      href: `/account/sales/${encodeURIComponent(order.id)}`,
    });
  }

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}

export async function executeOrderRefund(orderId: string, refundRequestId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      paymentStatus: true,
      paymentMethod: true,
      stripePaymentIntentId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxAmountCents: true,
      listing: { select: { title: true } },
      liveShippingSession: { select: { liveShowId: true } },
    },
  });
  if (!order) throw new RefundRequestError("NOT_FOUND", 404);
  if (order.paymentStatus === PAYMENT_REFUNDED) {
    await prisma.orderRefundRequest.updateMany({
      where: { id: refundRequestId, status: { not: OrderRefundRequestStatus.refunded } },
      data: { status: OrderRefundRequestStatus.refunded, refundedAt: new Date() },
    });
    return;
  }
  if (order.paymentMethod === OrderPaymentMethod.escrow) {
    throw new RefundRequestError("ESCROW_NOT_SUPPORTED", 400);
  }
  if (order.paymentMethod === OrderPaymentMethod.layaway) {
    // A layaway is paid across multiple separate PaymentIntents (deposit, installments, balance
    // payoff). `Order.stripePaymentIntentId` only ever holds the *last* one (see
    // `completeLayawayPlan`), so a single-PI refund here would refund at most one installment while
    // reporting the whole order as refunded — silently under-refunding the buyer. Use the
    // layaway-specific refund path (`defaultLayawayPlan` / `refundSupersededLayawayPayments`, which
    // loop over every paid `LayawayPayment`) instead. This flow is also unreachable in practice
    // today since `resolveLiveOrderRefundEligibility` requires a live-show order and layaways are
    // never live-show orders — this guard exists as defense-in-depth against future callers.
    throw new RefundRequestError("LAYAWAY_NOT_SUPPORTED", 400);
  }
  if (!order.stripePaymentIntentId) {
    throw new RefundRequestError("NO_PAYMENT_INTENT", 400);
  }
  if (!isStripeConfigured()) {
    throw new RefundRequestError("STRIPE_NOT_CONFIGURED", 503);
  }

  const refundAmountCents = fullRefundAmountCents({
    itemPriceUsd: order.itemPriceUsd,
    shippingPriceUsd: order.shippingPriceUsd,
    taxAmountCents: order.taxAmountCents ?? 0,
  });

  const stripe = getStripe();
  let stripeRefundId: string | null = null;
  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: refundAmountCents,
      // Destination-charge orders transfer (item + shipping - fee) to the seller's Connect
      // account at charge time. Without reverse_transfer, Stripe refunds the buyer entirely out
      // of the PLATFORM's own balance while the seller keeps the transferred funds — a silent
      // platform loss on every refund. reverse_transfer claws the seller's share back first.
      reverse_transfer: true,
      metadata: { orderId, refundRequestId, kind: "live_order_refund" },
    });
    stripeRefundId = refund.id;
  } catch (e) {
    console.error("[order-refund] stripe refund failed", orderId, e);
    throw new RefundRequestError("STRIPE_REFUND_FAILED", 502);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PAYMENT_REFUNDED,
        status: "cancelled",
        payoutStatus: "blocked",
        payoutBlockedReason: "refunded",
        taxRefundedCents: order.taxAmountCents ?? 0,
      },
    });

    await tx.listing.updateMany({
      where: { id: order.listingId, status: "sold" },
      data: { status: "ended" },
    });

    await removeOrderFromLiveShippingSessionOnRefundTx(tx, orderId);

    const liveRoomId = order.liveShippingSession?.liveShowId ?? null;
    if (liveRoomId) {
      await reverseLiveShowCompletedSaleTx(tx, liveRoomId, order.itemPriceUsd);
    }

    await tx.orderRefundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: OrderRefundRequestStatus.refunded,
        refundedAt: now,
        stripeRefundId,
      },
    });
  });

  const lt = listingTitleShort(order.listing.title);
  await createNotification(prisma, {
    userId: order.buyerId,
    type: "order_refunded",
    title: "Refund completed",
    body: `Your refund for “${lt}” has been processed.`,
    href: `/orders/${encodeURIComponent(order.id)}`,
  });
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "order_refunded_seller",
    title: "Order refunded",
    body: `Order “${lt}” was refunded to the buyer.`,
    href: `/account/sales/${encodeURIComponent(order.id)}`,
  });
  await logSellerCommerceEvent({
    sellerId: order.sellerId,
    listingId: order.listingId,
    orderId: order.id,
    kind: SELLER_COMMERCE_KIND.orderRefunded,
    title: "Refund issued",
    body: `Refund completed for “${lt}”.`,
  });

  emitOrderLifecycleSync({
    orderId: order.id,
    parties: { sellerId: order.sellerId, buyerId: order.buyerId },
    listingId: order.listingId,
    orderStatus: "cancelled",
    paymentStatus: PAYMENT_REFUNDED,
  });
}

export class RefundRequestError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "RefundRequestError";
  }
}

export async function listEscalatedRefundRequests(limit = 50) {
  const rows = await prisma.orderRefundRequest.findMany({
    where: { status: OrderRefundRequestStatus.escalated },
    orderBy: { escalatedAt: "asc" },
    take: limit,
    include: {
      order: {
        select: {
          id: true,
          totalUsd: true,
          listing: { select: { title: true } },
        },
      },
      buyer: { select: { id: true, username: true } },
      seller: { select: { id: true, username: true } },
    },
  });
  return rows.map((r) => ({
    ...serializeOrderRefundRequest(r),
    orderTotalUsd: r.order.totalUsd,
    listingTitle: r.order.listing.title,
    buyerUsername: r.buyer.username,
    sellerUsername: r.seller.username,
  }));
}
