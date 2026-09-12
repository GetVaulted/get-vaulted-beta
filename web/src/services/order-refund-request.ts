import Stripe from "stripe";
import {
  OrderRefundRequestKind,
  OrderRefundRequestStatus,
  OrderPaymentMethod,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { createNotification } from "@/lib/notifications";
import {
  ACTIVE_REFUND_REQUEST_STATUSES,
  resolveLiveOrderRefundEligibility,
  type LiveOrderRefundKind,
} from "@/lib/order-refund-eligibility";
import { reverseLiveShowCompletedSaleTx } from "@/lib/live-show-gmv";
import { serializeOrderRefundRequest, type OrderRefundRequestDto } from "@/lib/order-refund-types";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { fullRefundAmountCents } from "@/lib/sales-tax-charge";
import { prisma } from "@/lib/prisma";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isStripePaymentIntentId } from "@/lib/stripe-payment-intent-id";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import { refundPayPalRailCapture } from "@/lib/paypal-buyer-rail";
import { removeOrderFromLiveShippingSessionOnRefundTx } from "@/services/shipping/live-shipping-pricing";
import { isStripeBankPayoutId } from "@/services/payout/stripe-seller-payout";
import { PAYMENT_REFUNDED } from "@/services/payments";

/**
 * Real (not DB-guessed) USD available+pending balance on a seller's Connect account, in cents.
 * Used only to make a refund-after-payout exception verifiable against actual Stripe state
 * instead of a bare "payoutStatus said paid_out" note — see the financial reconciliation audit
 * (bug #14): the app previously never checked whether the seller's Connect balance could
 * actually absorb a reverse_transfer once their bank payout had already emptied it.
 */
async function readSellerConnectUsdBalanceCents(
  stripeAccountId: string,
): Promise<{ availableCents: number; pendingCents: number } | null> {
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });
    const availableCents = balance.available
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + b.amount, 0);
    const pendingCents = balance.pending
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + b.amount, 0);
    return { availableCents, pendingCents };
  } catch (e) {
    console.warn("[order-refund] could not read seller Connect balance for payout-safety check", {
      stripeAccountId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

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
  labelUrl: true,
  shippoTransactionId: true,
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
    labelUrl: order.labelUrl,
    shippoTransactionId: order.shippoTransactionId,
  };
}

const ACTIVE_STATUSES = [...ACTIVE_REFUND_REQUEST_STATUSES] as OrderRefundRequestStatus[];

async function getLatestRefundRequest(orderId: string) {
  return prisma.orderRefundRequest.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

function isUniqueConstraintError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2002");
}

/**
 * True only when Stripe definitively rejected the refund request itself before any money moved
 * (bad/invalid parameter, charge in a state that can't be refunded, etc.) — a
 * `StripeInvalidRequestError` means Stripe received, validated, and rejected the request
 * synchronously. Any other error (connection error, timeout, rate limit, generic API error) is
 * genuinely ambiguous: Stripe may have processed the refund despite the response never reaching
 * us, so those must NOT be treated as definite (mirrors `isDefiniteStripeCardDecline`'s
 * definite-vs-ambiguous split for charges).
 */
function isDefiniteStripeRefundFailure(e: unknown): boolean {
  return e instanceof Stripe.errors.StripeInvalidRequestError;
}

function isSerializationConflict(e: unknown): boolean {
  // P2034: "Transaction failed due to a write conflict or a deadlock" — Postgres aborting one
  // side of a Serializable-isolation race. Not itself proof a duplicate exists, just that two
  // writers collided; treated the same as "already open" here since the caller should re-check
  // rather than blindly retry a financial mutation.
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2034");
}

/**
 * Creates an `OrderRefundRequest` row while guaranteeing at most one "active" (in-flight) request
 * can ever exist per order, even under concurrent callers (FIX: two simultaneous requests could
 * previously both pass the "no active request" read before either write landed). Layers two
 * independent safeguards:
 *  1. The read-check-then-create happens inside a single Serializable-isolation transaction, so
 *     Postgres itself detects and aborts a losing concurrent transaction rather than allowing both
 *     to observe "no active request".
 *  2. A DB-level partial unique index (`OrderRefundRequest_orderId_active_unique`, see migrations)
 *     is the final backstop — even if isolation were ever weakened, the index makes a second
 *     concurrent insert for the same order impossible at the storage layer.
 * Both failure modes are translated back into the same `REQUEST_ALREADY_OPEN` error the
 * non-concurrent path already returns, so callers don't need to know which safeguard fired.
 */
async function createRefundRequestRowAtomically(
  orderId: string,
  data: {
    kind: OrderRefundRequestKind;
    status: OrderRefundRequestStatus;
    buyerId: string;
    sellerId: string;
    reason: string;
    photoUrls?: string[];
    sellerDirect?: boolean;
  },
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const active = await tx.orderRefundRequest.findFirst({
          where: { orderId, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: "desc" },
        });
        if (active) {
          throw new RefundRequestError("REQUEST_ALREADY_OPEN", 409);
        }
        return tx.orderRefundRequest.create({ data: { ...data, orderId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof RefundRequestError) throw e;
    if (isUniqueConstraintError(e) || isSerializationConflict(e)) {
      throw new RefundRequestError("REQUEST_ALREADY_OPEN", 409);
    }
    throw e;
  }
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

  // POLICY CHOICE (flagged for owner review — see final report): a buyer whose escalated request
  // was denied by support is allowed to re-file exactly ONCE (i.e. up to two total support
  // denials on the same order) before being told to contact support directly instead of
  // auto-filing further requests. This preserves a legitimate appeal path (support_denied is
  // deliberately NOT in `ACTIVE_REFUND_REQUEST_STATUSES`, so it never blocks a first re-file) while
  // closing the previously-unlimited re-file loop. Adjust `MAX_SUPPORT_DENIALS_BEFORE_LOCKOUT` if
  // the intended limit differs.
  const latest = await getLatestRefundRequest(args.orderId);
  if (latest?.status === OrderRefundRequestStatus.support_denied) {
    const MAX_SUPPORT_DENIALS_BEFORE_LOCKOUT = 2;
    const priorDenialCount = await prisma.orderRefundRequest.count({
      where: { orderId: args.orderId, status: OrderRefundRequestStatus.support_denied },
    });
    if (priorDenialCount >= MAX_SUPPORT_DENIALS_BEFORE_LOCKOUT) {
      throw new RefundRequestError("REFILE_LIMIT_REACHED", 409);
    }
  }

  const row = await createRefundRequestRowAtomically(args.orderId, {
    kind: args.kind === "cancel" ? OrderRefundRequestKind.cancel : OrderRefundRequestKind.return,
    status: OrderRefundRequestStatus.pending_seller,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    reason,
    photoUrls,
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

  const reason = trimStr(args.reason, 2000);
  if (reason.length < 3) {
    throw new RefundRequestError("REASON_REQUIRED", 400);
  }
  const audit = await createRefundRequestRowAtomically(args.orderId, {
    kind: OrderRefundRequestKind.cancel,
    status: OrderRefundRequestStatus.pending_seller,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    reason,
    sellerDirect: true,
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
      // Re-check: seller may have created a label (or shipped) while the request was pending.
      const eligibility = resolveLiveOrderRefundEligibility(gateInputFromOrder(order));
      if (eligibility.kind !== "cancel") {
        throw new RefundRequestError(eligibility.blockedReason ?? "NOT_ELIGIBLE", 400);
      }
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

  const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
  scheduleNotifyAdmins({
    type: "admin_refund_escalated",
    title: "Refund escalated to support",
    body: `Buyer escalated a ${req.kind} refund for “${lt}”.`,
    href: "/admin/refund-requests",
    dedupeKey: `refund-escalated:${req.id}`,
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

  // Both `awaiting_return` (seller approved, buyer has not acted yet) and `return_in_transit`
  // (buyer submitted tracking) are fetched here so we can distinguish "no return in progress at
  // all" from "return approved but buyer hasn't shipped it yet" and return a precise error for
  // each, instead of collapsing them into one generic "not found"-style response.
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
  // CRITICAL: a seller must never be able to trigger a refund unilaterally. `awaiting_return`
  // means the seller approved the return but the buyer has not yet taken any action (no tracking
  // submitted via `buyerSubmitReturnTracking`) — the item may still be sitting with the buyer.
  // Only `return_in_transit` (set once the buyer actually submits return shipment/tracking)
  // proves the buyer has acted, so only that status may proceed to "confirm received" + refund.
  if (req.status !== OrderRefundRequestStatus.return_in_transit) {
    throw new RefundRequestError("BUYER_HAS_NOT_SHIPPED_RETURN", 400);
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
  /** When approving a return escalation, skip the ship-back step and refund immediately. */
  forceRefund?: boolean;
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
    if (req.kind === OrderRefundRequestKind.cancel || args.forceRefund) {
      await prisma.orderRefundRequest.update({
        where: { id: req.id },
        data: {
          supportNote: note,
          supportResolvedAt: now,
          ...(req.kind === OrderRefundRequestKind.return
            ? { returnReceivedAt: req.returnReceivedAt ?? now }
            : {}),
        },
      });
      await executeOrderRefund(order.id, req.id);
      await createNotification(prisma, {
        userId: order.buyerId,
        type: "order_refund_support_approved",
        title: "Support issued refund",
        body: `Get Vaulted support approved and refunded “${lt}”.`,
        href: `/orders/${encodeURIComponent(order.id)}`,
      });
      await createNotification(prisma, {
        userId: order.sellerId,
        type: "order_refund_support_approved_seller",
        title: "Support issued refund",
        body: `Support refunded the buyer for “${lt}”.`,
        href: `/account/sales/${encodeURIComponent(order.id)}`,
      });
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

const ADMIN_FORCE_REFUND_STATUSES: OrderRefundRequestStatus[] = [
  OrderRefundRequestStatus.pending_seller,
  OrderRefundRequestStatus.awaiting_return,
  OrderRefundRequestStatus.return_in_transit,
  OrderRefundRequestStatus.escalated,
  OrderRefundRequestStatus.seller_denied,
];

/**
 * Admin override: issue the Stripe refund immediately without waiting for return tracking /
 * seller confirm. Used when support assigns the refund (e.g. dispute override).
 */
export async function adminForceRefundRequest(args: {
  requestId: string;
  adminUserId: string;
  note?: string;
}) {
  const req = await prisma.orderRefundRequest.findUnique({
    where: { id: args.requestId },
    include: {
      order: { select: ORDER_SELECT },
    },
  });
  if (!req) throw new RefundRequestError("NOT_FOUND", 404);
  if (req.status === OrderRefundRequestStatus.refunded) {
    return serializeOrderRefundRequest(req);
  }
  if (req.status === OrderRefundRequestStatus.refund_processing) {
    throw new RefundRequestError("REFUND_ALREADY_PROCESSING", 409);
  }
  if (!ADMIN_FORCE_REFUND_STATUSES.includes(req.status)) {
    throw new RefundRequestError("NOT_FORCEABLE", 400);
  }

  const order = req.order;
  const lt = listingTitleShort(order.listing.title);
  const note =
    trimStr(args.note, 2000) ||
    `Admin force refund by ${args.adminUserId} (override return flow)`;
  const now = new Date();

  await prisma.orderRefundRequest.update({
    where: { id: req.id },
    data: {
      supportNote: note,
      supportResolvedAt: now,
      ...(req.kind === OrderRefundRequestKind.return
        ? { returnReceivedAt: req.returnReceivedAt ?? now }
        : {}),
    },
  });

  console.warn("[order-refund] admin force refund", {
    requestId: req.id,
    orderId: order.id,
    adminUserId: args.adminUserId,
    previousStatus: req.status,
  });

  await executeOrderRefund(order.id, req.id);

  await createNotification(prisma, {
    userId: order.buyerId,
    type: "order_refund_admin_force",
    title: "Refund issued",
    body: `Get Vaulted issued a refund for “${lt}”.`,
    href: `/orders/${encodeURIComponent(order.id)}`,
  });
  await createNotification(prisma, {
    userId: order.sellerId,
    type: "order_refund_admin_force_seller",
    title: "Buyer refunded by support",
    body: `Support refunded the buyer for “${lt}”.`,
    href: `/account/sales/${encodeURIComponent(order.id)}`,
  });

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
      paymentProcessor: true,
      stripePaymentIntentId: true,
      processorPaymentId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxAmountCents: true,
      payoutStatus: true,
      processorTransferId: true,
      listing: { select: { title: true } },
      liveShippingSession: { select: { liveShowId: true } },
      seller: { select: { stripeAccountId: true } },
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
  // Route by the processor that actually took the buyer's money (bug #18 follow-up) — never
  // assume Stripe just because that used to be the only rail. `paymentProcessor` defaults to
  // STRIPE at the schema level; treat a missing value (e.g. an older row/test fixture) the same
  // way. Missing or unrecognized processor metadata fails safely — an urgent anomaly plus a
  // distinct error — instead of silently attempting the wrong rail.
  const processor = order.paymentProcessor ?? "STRIPE";
  if (processor === "STRIPE") {
    if (!isStripePaymentIntentId(order.stripePaymentIntentId)) {
      reportUrgentPaymentAnomaly(
        "refund_missing_or_invalid_stripe_payment_intent",
        `orderId=${orderId} refundRequestId=${refundRequestId} paymentProcessor=STRIPE but ` +
          `stripePaymentIntentId=${order.stripePaymentIntentId ?? "null"} is missing or not ` +
          `Stripe-shaped — refusing to attempt a Stripe refund with it.`,
      );
      throw new RefundRequestError("NO_PAYMENT_INTENT", 400);
    }
    if (!isStripeConfigured()) {
      throw new RefundRequestError("STRIPE_NOT_CONFIGURED", 503);
    }
  } else if (processor === "PAYPAL_VENMO") {
    if (!order.processorPaymentId?.trim()) {
      reportUrgentPaymentAnomaly(
        "refund_missing_processor_payment_id",
        `orderId=${orderId} refundRequestId=${refundRequestId} paymentProcessor=PAYPAL_VENMO but ` +
          `processorPaymentId is missing — refusing to attempt a PayPal refund without it.`,
      );
      throw new RefundRequestError("NO_PROCESSOR_PAYMENT_ID", 400);
    }
  } else {
    reportUrgentPaymentAnomaly(
      "refund_unknown_payment_processor",
      `orderId=${orderId} refundRequestId=${refundRequestId} paymentProcessor=${String(processor)} ` +
        `is not a recognized rail — refusing to guess which processor to refund through.`,
    );
    throw new RefundRequestError("UNKNOWN_PAYMENT_PROCESSOR", 500);
  }

  const refundAmountCents = fullRefundAmountCents({
    itemPriceUsd: order.itemPriceUsd,
    shippingPriceUsd: order.shippingPriceUsd,
    taxAmountCents: order.taxAmountCents ?? 0,
  });
  // Stable per refund-request (not per attempt/timestamp) so retries — a network blip, a duplicate
  // admin click, or this very function being re-run after the DB-finalize step below fails — can
  // never cause Stripe to double-refund the buyer. Stripe dedupes on this key for 24h+ regardless
  // of how many times `refunds.create` is called with it.
  const idempotencyKey = `order_refund_${refundRequestId}_${refundAmountCents}c`;

  // CRITICAL (atomicity with Stripe): durably record that a refund is in flight BEFORE calling
  // Stripe, using this exact row + idempotency key. If the process crashes, or the finalize
  // transaction below fails, right after Stripe successfully refunds the buyer, this write is the
  // only reason the system can tell "Stripe has the money moving, DB hasn't confirmed it yet"
  // apart from actually calling Stripe again. `reconcileStripeWithDatabase`'s refund check
  // (`reconcileRefunds`) scans Stripe's succeeded refunds and replays `charge.refunded` for any
  // order that doesn't yet reflect the refund — which now also flips any `refund_processing` row
  // for that order to `refunded` (see the `charge.refunded` handler in `services/payments.ts`).
  // A no-op if this function is being retried and the row is already `refund_processing` or
  // terminal `refunded`. Captured *before* that write so a definite Stripe failure below can roll
  // the status back to exactly what it was when this attempt started (see catch block) — if the
  // row was already `refund_processing` entering this attempt (i.e. this call is itself a retry
  // of an earlier ambiguous failure), `statusBeforeThisAttempt` is `refund_processing`, so the
  // rollback below is naturally a no-op and correctly leaves it processing rather than assuming
  // the earlier ambiguous attempt definitely failed too.
  const priorRequest = await prisma.orderRefundRequest.findUnique({
    where: { id: refundRequestId },
    select: { status: true },
  });
  const statusBeforeThisAttempt = priorRequest?.status ?? null;

  await prisma.orderRefundRequest.updateMany({
    where: {
      id: refundRequestId,
      status: { notIn: [OrderRefundRequestStatus.refund_processing, OrderRefundRequestStatus.refunded] },
    },
    data: { status: OrderRefundRequestStatus.refund_processing },
  });

  // Verify against REAL Stripe balance state, not just the DB's payoutStatus label, before
  // attempting a reverse_transfer against a seller who may have already been paid to their bank.
  // We still proceed with the refund either way — the buyer's refund cannot wait on this — but a
  // seller whose Connect balance can't cover the reversal needs a loud, verified alert raised
  // *before* the attempt, not just a note discovered after the fact. Connect balance only exists
  // on the Stripe rail — the PayPal seller-payout rail has no equivalent check available here.
  const alreadyPaidOut = order.payoutStatus === "paid_out";
  const sellerAccountId = order.seller.stripeAccountId?.trim() || null;
  const preRefundBalance =
    processor === "STRIPE" && alreadyPaidOut && sellerAccountId
      ? await readSellerConnectUsdBalanceCents(sellerAccountId)
      : null;
  if (processor === "STRIPE" && alreadyPaidOut && preRefundBalance) {
    const availablePlusPending = preRefundBalance.availableCents + preRefundBalance.pendingCents;
    if (availablePlusPending < refundAmountCents) {
      const payoutKind = isStripeBankPayoutId(order.processorTransferId)
        ? "confirmed_stripe_bank_payout"
        : "heuristic_or_manual_paid_out_marker";
      reportUrgentPaymentAnomaly(
        "refund_after_payout_insufficient_connect_balance",
        `orderId=${orderId} sellerId=${order.sellerId} refundRequestId=${refundRequestId} ` +
          `refundAmountCents=${refundAmountCents} sellerConnectAvailableCents=${preRefundBalance.availableCents} ` +
          `sellerConnectPendingCents=${preRefundBalance.pendingCents} processorTransferId=${order.processorTransferId ?? "null"} ` +
          `payoutKind=${payoutKind} — reverse_transfer is about to be attempted against a Connect balance that ` +
          `cannot fully cover it; this will likely drive the seller's balance negative or fail outright. ` +
          `Needs manual follow-up regardless of outcome.`,
      );
    }
  }
  if (processor === "PAYPAL_VENMO" && alreadyPaidOut) {
    // Stripe's reverse_transfer automatically claws back the seller's share from their Connect
    // balance; the PayPal seller-payout rail (`createSellerPayPalPayout`) has no equivalent —
    // once a PayPal payout has gone out, this refund cannot automatically recover it. The buyer's
    // refund still proceeds (it can't wait on manual seller recovery), but ops needs a loud,
    // upfront alert rather than discovering the gap later.
    reportUrgentPaymentAnomaly(
      "refund_after_paypal_payout_no_clawback",
      `orderId=${orderId} sellerId=${order.sellerId} refundRequestId=${refundRequestId} ` +
        `refundAmountCents=${refundAmountCents} — seller was already paid out via the PayPal rail; ` +
        `there is no automated clawback for this refund. Manual follow-up required.`,
    );
  }

  let refundId: string | null = null;
  if (processor === "STRIPE") {
    const stripe = getStripe();
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
      }, { idempotencyKey });
      refundId = refund.id;
    } catch (e) {
      console.error("[order-refund] stripe refund failed", orderId, e);
      // Only roll back when Stripe *definitely* rejected this request before any money moved (see
      // `isDefiniteStripeRefundFailure`) and this row's status right before this attempt wasn't
      // already `refund_processing`/`refunded` (which would mean either an earlier attempt is
      // ambiguously still in flight, or the refund already completed — never safe to touch either).
      // A network/timeout/rate-limit error leaves the row `refund_processing`: Stripe may have
      // actually processed the refund despite us not getting confirmation, so it must stay pending
      // reconciliation rather than reopening the request for a new attempt.
      if (
        isDefiniteStripeRefundFailure(e) &&
        statusBeforeThisAttempt &&
        statusBeforeThisAttempt !== OrderRefundRequestStatus.refund_processing &&
        statusBeforeThisAttempt !== OrderRefundRequestStatus.refunded
      ) {
        await prisma.orderRefundRequest.updateMany({
          where: { id: refundRequestId, status: OrderRefundRequestStatus.refund_processing },
          data: { status: statusBeforeThisAttempt },
        });
      }
      throw new RefundRequestError("STRIPE_REFUND_FAILED", 502);
    }
  } else {
    // processor === "PAYPAL_VENMO" — every other value was already rejected above.
    const result = await refundPayPalRailCapture({
      processorPaymentId: order.processorPaymentId!,
      amountUsd: refundAmountCents / 100,
    });
    if (result.outcome !== "refunded") {
      console.error("[order-refund] paypal rail refund failed", orderId, result);
      // Mirrors `isDefiniteStripeRefundFailure`: only these two codes fire before any PayPal API
      // call is made (misconfiguration / missing id caught above), so only they are safe to treat
      // as "definitely nothing happened". Any actual API-level failure is ambiguous — PayPal may
      // have processed the refund despite the response not reaching us — so the row stays
      // `refund_processing` pending manual reconciliation, same as the Stripe ambiguous case.
      const isDefinitePreflightFailure =
        result.code === "PAYPAL_RAIL_NOT_CONFIGURED" || result.code === "MISSING_PROCESSOR_PAYMENT_ID";
      if (
        isDefinitePreflightFailure &&
        statusBeforeThisAttempt &&
        statusBeforeThisAttempt !== OrderRefundRequestStatus.refund_processing &&
        statusBeforeThisAttempt !== OrderRefundRequestStatus.refunded
      ) {
        await prisma.orderRefundRequest.updateMany({
          where: { id: refundRequestId, status: OrderRefundRequestStatus.refund_processing },
          data: { status: statusBeforeThisAttempt },
        });
      }
      throw new RefundRequestError("PAYPAL_REFUND_FAILED", 502);
    }
    refundId = result.refundId;
  }

  const now = new Date();
  try {
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
          // `stripeRefundId` stays Stripe-only (bug #18) — `processorRefundId` records the refund
          // id for whichever rail actually processed it.
          stripeRefundId: processor === "STRIPE" ? refundId : null,
          processorRefundId: refundId,
        },
      });
    });

    const { reverseStripeTaxTransaction } = await import("@/lib/stripe-tax");
    const { moneyFlowLog } = await import("@/lib/money-flow-log");
    moneyFlowLog("refund_created", { orderId, processor, refundId, refundAmountCents });
    void reverseStripeTaxTransaction({
      orderId,
      reverseAmountCents: order.taxAmountCents ?? 0,
      reason: "live_order_refund",
    });
  } catch (e) {
    // CRITICAL: the processor has ALREADY refunded the buyer at this point (`refundId` is set).
    // Do NOT retry the refund call here (Stripe would just re-hit the same idempotency key; PayPal
    // has no automatic retry-safety beyond that) and do NOT swallow this — surface a distinct error
    // so the caller/UI knows the refund is genuinely in flight rather than failed outright. The row
    // stays `refund_processing`: the DB and the processor are temporarily out of sync but never
    // *permanently* for Stripe — `reconcileStripeWithDatabase` runs on a schedule (see its cron
    // route) and will find this Stripe refund, discover the order/row don't yet reflect it, and
    // finish the job (order fields + this row -> `refunded` + buyer/seller notifications), all via
    // the same idempotent `charge.refunded` handling the real webhook uses. There is no equivalent
    // reconciliation cron for the PayPal rail yet — a `refund_processing` PayPal row left here needs
    // manual follow-up until one exists. Nothing here can cause a double refund: the finalize write
    // above is a no-op once it eventually succeeds (webhook or this function retried), guarded by
    // the `refunded` terminal status.
    console.error(
      "[order-refund] processor refund succeeded but DB finalize failed — order/request left as refund_processing pending reconciliation",
      { orderId, refundRequestId, processor, refundId },
      e,
    );
    throw new RefundRequestError("REFUND_ISSUED_PENDING_DB_SYNC", 500);
  }

  if (processor === "STRIPE" && alreadyPaidOut) {
    // Money was already released to the seller before this refund ran (e.g. an admin approved
    // payout while a buyer's refund request was in flight) — `reverse_transfer` still claws the
    // funds back from Stripe's side, but this needs to stand out from routine refunds in the
    // payout audit trail since the platform absorbed a timing gap instead of holding the money.
    // Re-read the REAL post-reversal balance (rather than assuming reverse_transfer worked) so
    // this record reflects verified Stripe state, not just what the DB believed going in.
    // (PayPal-rail alreadyPaidOut orders were already handled via the pre-refund anomaly above —
    // there is no Connect-style balance to re-check on that rail.)
    const postRefundBalance = sellerAccountId
      ? await readSellerConnectUsdBalanceCents(sellerAccountId)
      : null;
    const wentNegative = postRefundBalance != null && postRefundBalance.availableCents < 0;
    if (wentNegative) {
      reportUrgentPaymentAnomaly(
        "refund_after_payout_drove_balance_negative",
        `orderId=${orderId} sellerId=${order.sellerId} refundRequestId=${refundRequestId} ` +
          `refundId=${refundId} sellerConnectAvailableCentsAfter=${postRefundBalance.availableCents} ` +
          `— reverse_transfer completed but the seller's Connect balance is now negative; verify recovery via future transfers.`,
      );
    }
    await logPayoutEligibilityDecision({
      sellerId: order.sellerId,
      orderId: order.id,
      action: "order_payout_blocked",
      previousStatus: "paid_out",
      newStatus: "blocked",
      reason:
        `Refund executed after payout was already released (refundRequestId=${refundRequestId}). ` +
        `Pre-refund Connect balance: available=${preRefundBalance?.availableCents ?? "unknown"}c ` +
        `pending=${preRefundBalance?.pendingCents ?? "unknown"}c. ` +
        `Post-refund Connect balance: available=${postRefundBalance?.availableCents ?? "unknown"}c ` +
        `pending=${postRefundBalance?.pendingCents ?? "unknown"}c.`,
    });
  }

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

  void import("@/lib/giveaway/purchase-entries")
    .then((m) => m.clawbackPurchaseEntriesForOrder(order.id))
    .catch((e) => console.warn("[giveaway] purchase clawback failed (refund)", order.id, e));
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

/** How long a request must have sat in `refund_processing` before an admin is allowed to trigger
 * a manual retry/recheck — long enough that a normal in-flight refund has surely either finished
 * or hit the ambiguous-failure path this exists for, short enough that a genuinely stuck request
 * doesn't need a raw DB fix for long. */
export const STUCK_REFUND_PROCESSING_MS = 3 * 60 * 1000;

export async function listStuckProcessingRefundRequests(limit = 50) {
  const rows = await prisma.orderRefundRequest.findMany({
    where: { status: OrderRefundRequestStatus.refund_processing },
    orderBy: { updatedAt: "asc" },
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
    stuckForMs: Date.now() - r.updatedAt.getTime(),
  }));
}

/**
 * Admin-triggered recovery for a refund request stuck in `refund_processing` (FIX: previously the
 * only way out of this state was a raw DB fix — see `executeOrderRefund`'s ambiguous-failure
 * path). Simply re-runs `executeOrderRefund`: it's always safe to retry because the Stripe call
 * reuses the same per-request idempotency key (Stripe dedupes/replays rather than double-refunding)
 * and the DB finalize step is itself idempotent once `refunded`/`refund_processing` guards are hit.
 * Gated behind `STUCK_REFUND_PROCESSING_MS` so this can't be used to race a refund that is still
 * genuinely in flight.
 */
export async function adminRetryStuckRefund(args: { requestId: string; adminUserId: string }) {
  const req = await prisma.orderRefundRequest.findUnique({ where: { id: args.requestId } });
  if (!req) throw new RefundRequestError("NOT_FOUND", 404);
  if (req.status !== OrderRefundRequestStatus.refund_processing) {
    throw new RefundRequestError("NOT_STUCK", 400);
  }
  const stuckForMs = Date.now() - req.updatedAt.getTime();
  if (stuckForMs < STUCK_REFUND_PROCESSING_MS) {
    throw new RefundRequestError("NOT_STUCK_YET", 400);
  }

  console.warn("[order-refund] admin retrying stuck refund_processing request", {
    requestId: req.id,
    orderId: req.orderId,
    adminUserId: args.adminUserId,
    stuckForMs,
  });
  await executeOrderRefund(req.orderId, req.id);

  const updated = await prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: req.id } });
  return serializeOrderRefundRequest(updated);
}
