import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin/admin-audit";

/** Dispute statuses that still need our response (or may still accept evidence). */
export const OPEN_DISPUTE_STATUSES = ["needs_response", "warning_needs_response", "under_review", "warning_under_review"];
export const NEEDS_RESPONSE_STATUSES = ["needs_response", "warning_needs_response"];

export class DisputeError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "DisputeError";
  }
}

function chargeIdOf(d: Stripe.Dispute): string {
  return typeof d.charge === "string" ? d.charge : d.charge.id;
}
function paymentIntentIdOf(d: Stripe.Dispute): string | null {
  const pi = d.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/** Plain data we store for a Stripe dispute object (pure, easy to test). */
export function disputeRowFromStripe(d: Stripe.Dispute, orderId: string | null) {
  const due = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000) : null;
  const closed = ["won", "lost", "charge_refunded"].includes(d.status);
  return {
    id: d.id,
    orderId,
    chargeId: chargeIdOf(d),
    paymentIntentId: paymentIntentIdOf(d),
    amountCents: d.amount,
    currency: d.currency,
    reason: d.reason ?? "",
    status: d.status,
    evidenceDueBy: due,
    hasEvidence: Boolean(d.evidence_details?.has_evidence),
    submissionCount: d.evidence_details?.submission_count ?? 0,
    pastDue: Boolean(d.evidence_details?.past_due),
    openedAt: new Date(d.created * 1000),
    closedAt: closed ? new Date() : null,
  };
}

/** Best-effort: webhook and sync call this; a failure here must never break payment handling. */
export async function recordStripeDispute(d: Stripe.Dispute, orderId: string | null): Promise<void> {
  try {
    const row = disputeRowFromStripe(d, orderId);
    const { id, closedAt, orderId: oid, ...rest } = row;
    await prisma.stripeDispute.upsert({
      where: { id },
      create: { id, closedAt, orderId: oid, ...rest },
      // Never overwrite a known order link with null, and keep the first closedAt we saw.
      update: { ...rest, ...(oid ? { orderId: oid } : {}), ...(closedAt ? { closedAt } : {}) },
    });
  } catch (e) {
    console.error("[disputes] failed to record dispute", d.id, e);
  }
}

async function orderIdForPaymentIntent(piId: string | null): Promise<string | null> {
  if (!piId) return null;
  const o = await prisma.order.findFirst({ where: { stripePaymentIntentId: piId }, select: { id: true } });
  return o?.id ?? null;
}

/** Pull recent disputes from Stripe into the local table (read-only toward Stripe). */
export async function syncDisputesFromStripe(stripe: Stripe, max = 300): Promise<number> {
  let n = 0;
  for await (const d of stripe.disputes.list({ limit: 100 })) {
    await recordStripeDispute(d, await orderIdForPaymentIntent(paymentIntentIdOf(d)));
    if (++n >= max) break;
  }
  return n;
}

export async function listDisputes() {
  const rows = await prisma.stripeDispute.findMany({
    orderBy: [{ evidenceDueBy: "asc" }, { openedAt: "desc" }],
    take: 300,
  });
  const orderIds = rows.map((r) => r.orderId).filter((x): x is string => !!x);
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          totalUsd: true,
          payoutStatus: true,
          listing: { select: { title: true } },
          buyer: { select: { id: true, username: true } },
          seller: { select: { id: true, username: true } },
        },
      })
    : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  return rows.map((r) => {
    const o = r.orderId ? byId.get(r.orderId) : undefined;
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      amountCents: r.amountCents,
      evidenceDueBy: r.evidenceDueBy?.toISOString() ?? null,
      hasEvidence: r.hasEvidence,
      submissionCount: r.submissionCount,
      pastDue: r.pastDue,
      openedAt: r.openedAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      adminNote: r.adminNote,
      needsResponse: NEEDS_RESPONSE_STATUSES.includes(r.status),
      isOpen: OPEN_DISPUTE_STATUSES.includes(r.status),
      order: o
        ? {
            id: o.id,
            title: o.listing?.title ?? "(item)",
            totalUsd: o.totalUsd,
            payoutStatus: String(o.payoutStatus),
            buyer: o.buyer,
            seller: o.seller,
          }
        : null,
    };
  });
}

export type DisputeEvidenceInput = {
  customerName?: string;
  customerEmail?: string;
  productDescription?: string;
  shippingCarrier?: string;
  shippingTrackingNumber?: string;
  shippingAddress?: string;
  shippingDate?: string;
  uncategorizedText?: string;
};

/** Evidence we can fill in from our own records, so the admin starts from facts instead of a blank form. */
export async function prefillDisputeEvidence(disputeId: string): Promise<DisputeEvidenceInput> {
  const d = await prisma.stripeDispute.findUnique({ where: { id: disputeId }, select: { orderId: true } });
  if (!d?.orderId) return {};
  const o = await prisma.order.findUnique({
    where: { id: d.orderId },
    select: {
      createdAt: true,
      totalUsd: true,
      carrier: true,
      trackingNumber: true,
      shippedAt: true,
      deliveryConfirmedAt: true,
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      shipCountry: true,
      listing: { select: { title: true } },
      buyer: { select: { name: true, username: true, email: true } },
    },
  });
  if (!o) return {};
  const lines = [
    `Order placed ${o.createdAt.toISOString().slice(0, 10)} for $${o.totalUsd.toFixed(2)} on Get Vaulted live commerce.`,
    o.shippedAt ? `Shipped ${o.shippedAt.toISOString().slice(0, 10)} via ${o.carrier ?? "carrier"}, tracking ${o.trackingNumber ?? "n/a"}.` : "",
    o.deliveryConfirmedAt ? `Delivery confirmed ${o.deliveryConfirmedAt.toISOString().slice(0, 10)}.` : "",
  ].filter(Boolean);
  return {
    customerName: o.shipRecipientName || o.buyer.name || o.buyer.username,
    customerEmail: o.buyer.email,
    productDescription: o.listing?.title ?? "",
    shippingCarrier: o.carrier ?? "",
    shippingTrackingNumber: o.trackingNumber ?? "",
    shippingAddress: [o.shipAddress, o.shipCity, o.shipState, o.shipZip, o.shipCountry].filter(Boolean).join(", "),
    shippingDate: o.shippedAt ? o.shippedAt.toISOString().slice(0, 10) : "",
    uncategorizedText: lines.join(" "),
  };
}

function toStripeEvidence(e: DisputeEvidenceInput): Stripe.DisputeUpdateParams.Evidence {
  const out: Stripe.DisputeUpdateParams.Evidence = {};
  if (e.customerName?.trim()) out.customer_name = e.customerName.trim();
  if (e.customerEmail?.trim()) out.customer_email_address = e.customerEmail.trim();
  if (e.productDescription?.trim()) out.product_description = e.productDescription.trim();
  if (e.shippingCarrier?.trim()) out.shipping_carrier = e.shippingCarrier.trim();
  if (e.shippingTrackingNumber?.trim()) out.shipping_tracking_number = e.shippingTrackingNumber.trim();
  if (e.shippingAddress?.trim()) out.shipping_address = e.shippingAddress.trim();
  if (e.shippingDate?.trim()) out.shipping_date = e.shippingDate.trim();
  if (e.uncategorizedText?.trim()) out.uncategorized_text = e.uncategorizedText.trim();
  return out;
}

/**
 * Send evidence to Stripe. `submit: false` saves a draft Stripe keeps; `submit: true` is FINAL
 * (the bank gets it and nothing more can be added). Moves no money by itself.
 */
export async function saveDisputeEvidence(
  stripe: Stripe,
  args: { adminUserId: string; disputeId: string; evidence: DisputeEvidenceInput; submit: boolean; reason: string },
) {
  const row = await prisma.stripeDispute.findUnique({ where: { id: args.disputeId } });
  if (!row) throw new DisputeError("NOT_FOUND", 404);
  if (!NEEDS_RESPONSE_STATUSES.includes(row.status)) throw new DisputeError("NOT_ACCEPTING_EVIDENCE", 409);
  const evidence = toStripeEvidence(args.evidence);
  if (Object.keys(evidence).length === 0) throw new DisputeError("EMPTY_EVIDENCE", 400);

  const updated = await stripe.disputes.update(args.disputeId, { evidence, submit: args.submit });
  await recordStripeDispute(updated, row.orderId);

  const order = row.orderId
    ? await prisma.order.findUnique({ where: { id: row.orderId }, select: { sellerId: true } })
    : null;
  await logAdminAction({
    adminUserId: args.adminUserId,
    action: args.submit ? "dispute.submit_evidence" : "dispute.save_evidence_draft",
    targetType: "dispute",
    targetId: args.disputeId,
    targetUserId: order?.sellerId ?? null,
    reason: args.reason,
    detail: { orderId: row.orderId, fields: Object.keys(evidence), status: updated.status },
  });
  return { status: updated.status, submitted: args.submit };
}

export async function setDisputeNote(args: { adminUserId: string; disputeId: string; note: string }) {
  const note = args.note.trim().slice(0, 2000);
  const row = await prisma.stripeDispute.update({ where: { id: args.disputeId }, data: { adminNote: note } }).catch(() => null);
  if (!row) throw new DisputeError("NOT_FOUND", 404);
  await logAdminAction({
    adminUserId: args.adminUserId,
    action: "dispute.note",
    targetType: "dispute",
    targetId: args.disputeId,
    reason: note,
  });
}
