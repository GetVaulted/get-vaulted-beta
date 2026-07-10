import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { processStripeWebhookEvent, resolveOrderIdForDisputedPaymentIntent } from "@/services/payments";
import { LIVE_BUY_NOW_PI_KIND } from "@/lib/stripe-charge-order-saved-pm";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Stripe <-> DB reconciliation (chaos engineering deep-dive, 2026-07). Recovery from a
 * lost/never-delivered Stripe webhook previously depended entirely on lazy triggers piggybacked on
 * user traffic (`reconcileStalePendingCheckoutSessionsGlobal`) — a buyer who paid and never
 * returned to the site could leave an order stuck `pending_payment` indefinitely with no admin
 * alert. This scans Stripe directly (source of truth) for each object type the platform creates
 * and replays anything not correctly reflected locally through the exact same idempotent
 * `processStripeWebhookEvent` dispatch the real webhook uses — no bespoke finalize logic to
 * duplicate/drift. Every check is safe to rerun: already-settled objects are skipped via a
 * `WebhookEventLog` dedupe marker, and every finalize path this replays into is itself guarded by
 * a DB-state check (CAS `updateMany` or a `findUnique` precheck), so replaying an
 * already-processed object is always a no-op, never a double side effect.
 *
 * Objects reconciled: Checkout Sessions, PaymentIntents (saved-card charges without a Checkout
 * Session), Disputes/Chargebacks, Refunds. Stripe Connect Payouts/Transfers are not created
 * directly by this app (only `transfer_data` on destination charges, which Check A already
 * reconciles) and Stripe manages their timing entirely on its own, so there is nothing
 * platform-side to reconcile for those two object types beyond what Check A already covers.
 */

const RECONCILE_SOURCE = "stripe-reconcile";
const ORPHAN_CHECKOUT_KINDS: ReadonlySet<string> = new Set(["buy_now", "pay_order", "layaway_deposit"]);
const ORPHAN_PI_KINDS: ReadonlySet<string> = new Set([
  "pay_order_saved_pm",
  LIVE_BUY_NOW_PI_KIND,
  "variant_purchase_saved_pm",
  "break_spot_saved_pm",
]);

export type StripeReconcileFinding = {
  category: "checkout_session" | "payment_intent" | "dispute" | "refund";
  stripeId: string;
  kind: string | null;
  orderId: string | null;
  issue: string;
};

export type StripeReconcileReport = {
  startedAt: string;
  finishedAt: string;
  lookbackHours: number;
  configured: boolean;
  scanned: {
    checkoutSessions: number;
    paymentIntents: number;
    disputes: number;
    refunds: number;
    stalePendingOrdersChecked: number;
  };
  healed: StripeReconcileFinding[];
  /** No local record to reconcile into — needs manual admin review; cannot be auto-fixed safely. */
  orphans: StripeReconcileFinding[];
  errors: StripeReconcileFinding[];
};

function emptyReport(lookbackHours: number, configured: boolean): StripeReconcileReport {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    lookbackHours,
    configured,
    scanned: { checkoutSessions: 0, paymentIntents: 0, disputes: 0, refunds: 0, stalePendingOrdersChecked: 0 },
    healed: [],
    orphans: [],
    errors: [],
  };
}

async function alreadyReconciled(externalId: string): Promise<boolean> {
  const row = await prisma.webhookEventLog.findFirst({
    where: { source: RECONCILE_SOURCE, externalId, processed: true },
    select: { id: true },
  });
  return Boolean(row);
}

async function logReconcileResult(externalId: string, eventType: string, ok: boolean, error?: string): Promise<void> {
  await prisma.webhookEventLog
    .create({
      data: {
        source: RECONCILE_SOURCE,
        eventType: eventType.slice(0, 200),
        externalId: externalId.slice(0, 200),
        payload: "",
        processed: ok,
        error: error ? error.slice(0, 8000) : null,
      },
    })
    .catch((e) => console.error("[stripe-reconcile] failed to write audit log row", externalId, e));
}

function syntheticStripeEvent(type: string, object: unknown): Stripe.Event {
  return {
    id: `reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  } as unknown as Stripe.Event;
}

async function replay(
  report: StripeReconcileReport,
  category: StripeReconcileFinding["category"],
  eventType: string,
  stripeId: string,
  kind: string | null,
  orderId: string | null,
  object: unknown,
): Promise<void> {
  try {
    await processStripeWebhookEvent(syntheticStripeEvent(eventType, object));
    report.healed.push({
      category,
      stripeId,
      kind,
      orderId,
      issue: `Replayed ${eventType} — local state was not yet reflecting this Stripe object.`,
    });
    await logReconcileResult(stripeId, eventType, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category, stripeId, kind, orderId, issue: msg });
    await logReconcileResult(stripeId, eventType, false, msg);
    reportCronAnomaly("stripe-reconcile", `failed to reconcile ${category} ${stripeId}: ${msg}`);
  }
}

/** Check A: Checkout Sessions Stripe shows as paid. Covers buy_now, pay_order, layaway_deposit/payment, break_spot, variant_purchase, live_tip. */
async function reconcileCheckoutSessions(
  stripe: Stripe,
  sinceUnix: number,
  limit: number,
  report: StripeReconcileReport,
): Promise<void> {
  const sessions = await stripe.checkout.sessions.list({
    status: "complete",
    created: { gte: sinceUnix },
    limit: Math.min(limit, 100),
  });

  for (const session of sessions.data) {
    // `status: "complete"` also includes free/no-payment-required and some async-payment-pending
    // sessions; only reconcile ones Stripe confirms were actually paid.
    if (session.payment_status !== "paid") continue;
    report.scanned.checkoutSessions += 1;
    const kind = session.metadata?.kind?.trim() || null;
    if (!kind) continue;
    if (await alreadyReconciled(session.id)) continue;

    const orderId = session.metadata?.orderId?.trim() || null;
    if (ORPHAN_CHECKOUT_KINDS.has(kind) && orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) {
        report.orphans.push({
          category: "checkout_session",
          stripeId: session.id,
          kind,
          orderId,
          issue:
            "Stripe checkout session is paid but no matching local Order exists. Buyer was very likely " +
            "charged with no order record — needs manual admin recovery (verify the charge, contact the " +
            "buyer/seller, and either manually recreate the order or issue a refund).",
        });
        await logReconcileResult(session.id, "checkout.session.completed", false, "orphan_no_local_order");
        reportCronAnomaly(
          "stripe-reconcile",
          `ORPHAN paid checkout session ${session.id} (kind=${kind}, orderId=${orderId}) has no local Order — buyer may be charged with no order record`,
        );
        continue;
      }
    }

    await replay(report, "checkout_session", "checkout.session.completed", session.id, kind, orderId, session);
  }
}

/** Check B: PaymentIntents Stripe shows as succeeded that were confirmed off-session (no Checkout Session), e.g. saved-card auction-win charges. */
async function reconcilePaymentIntents(
  stripe: Stripe,
  sinceUnix: number,
  limit: number,
  report: StripeReconcileReport,
): Promise<void> {
  const intents = await stripe.paymentIntents.list({ created: { gte: sinceUnix }, limit: Math.min(limit, 100) });

  for (const pi of intents.data) {
    if (pi.status !== "succeeded") continue;
    report.scanned.paymentIntents += 1;
    const kind = pi.metadata?.kind?.trim() || null;
    // Checkout-Session-driven PaymentIntents are already covered by `reconcileCheckoutSessions`
    // (Stripe fires `checkout.session.completed` for those, keyed on the session, not the PI) —
    // only reconcile the off-session / saved-card kinds here to avoid double-processing.
    if (!kind || !ORPHAN_PI_KINDS.has(kind)) continue;
    if (await alreadyReconciled(pi.id)) continue;

    const orderId = pi.metadata?.orderId?.trim() || null;
    const purchaseId = pi.metadata?.purchaseId?.trim() || null;
    if (orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) {
        report.orphans.push({
          category: "payment_intent",
          stripeId: pi.id,
          kind,
          orderId,
          issue:
            "Stripe PaymentIntent succeeded (saved-card charge) but no matching local Order exists — " +
            "needs manual admin recovery.",
        });
        await logReconcileResult(pi.id, "payment_intent.succeeded", false, "orphan_no_local_order");
        reportCronAnomaly(
          "stripe-reconcile",
          `ORPHAN succeeded PaymentIntent ${pi.id} (kind=${kind}, orderId=${orderId}) has no local Order`,
        );
        continue;
      }
    } else if (kind === "variant_purchase_saved_pm" && purchaseId) {
      const purchase = await prisma.liveItemVariantPurchase.findUnique({
        where: { id: purchaseId },
        select: { id: true },
      });
      if (!purchase) {
        report.orphans.push({
          category: "payment_intent",
          stripeId: pi.id,
          kind,
          orderId: null,
          issue:
            "Stripe PaymentIntent succeeded for a PYT/variant purchase but no matching LiveItemVariantPurchase exists — needs manual admin recovery.",
        });
        await logReconcileResult(pi.id, "payment_intent.succeeded", false, "orphan_no_local_variant_purchase");
        reportCronAnomaly(
          "stripe-reconcile",
          `ORPHAN succeeded PaymentIntent ${pi.id} (kind=${kind}, purchaseId=${purchaseId}) has no local LiveItemVariantPurchase`,
        );
        continue;
      }
    }

    await replay(report, "payment_intent", "payment_intent.succeeded", pi.id, kind, orderId, pi);
  }
}

/** Check C: Disputes/chargebacks — verify payout is frozen while open, and the order reflects a loss once closed. */
async function reconcileDisputes(
  stripe: Stripe,
  sinceUnix: number,
  limit: number,
  report: StripeReconcileReport,
): Promise<void> {
  const disputes = await stripe.disputes.list({ created: { gte: sinceUnix }, limit: Math.min(limit, 100) });

  for (const dispute of disputes.data) {
    report.scanned.disputes += 1;
    // Key on id+status so a dispute transitioning (created -> closed) is re-checked once more.
    const dedupeKey = `${dispute.id}:${dispute.status}`;
    if (await alreadyReconciled(dedupeKey)) continue;

    const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    const orderId = piId ? await resolveOrderIdForDisputedPaymentIntent(piId) : null;
    if (!orderId) {
      // No PaymentIntent (or no matching order) to attach this dispute to — cannot reconcile, but
      // also cannot be "healed" automatically; surface for manual review rather than silently drop.
      report.orphans.push({
        category: "dispute",
        stripeId: dispute.id,
        kind: dispute.status,
        orderId: null,
        issue: "Dispute could not be matched to a local order (no PaymentIntent match) — verify manually in Stripe.",
      });
      await logReconcileResult(dedupeKey, "charge.dispute", false, "no_matching_order");
      continue;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { payoutStatus: true, paymentStatus: true },
    });
    if (!order) continue;

    const closed = dispute.status !== "warning_needs_response" && dispute.status !== "needs_response" && dispute.status !== "under_review" && dispute.status !== "warning_under_review" && dispute.status !== "warning_closed";
    const isLost = dispute.status === "lost";

    const looksReconciled = closed
      ? isLost
        ? order.paymentStatus === "chargeback"
        : true // won/warning_closed — payout hold should already have been released by the webhook; not auto-corrected here (see note below)
      : order.payoutStatus === "blocked" || order.payoutStatus === "manual_review";

    if (looksReconciled) {
      await logReconcileResult(dedupeKey, closed ? "charge.dispute.closed" : "charge.dispute.created", true);
      continue;
    }

    const eventType = closed ? "charge.dispute.closed" : "charge.dispute.created";
    await replay(report, "dispute", eventType, dedupeKey, dispute.status, orderId, dispute);
  }
}

/** Check D: Refunds Stripe shows as succeeded — verify the local order reflects the refund (safety net for refunds issued directly in the Stripe Dashboard). */
async function reconcileRefunds(
  stripe: Stripe,
  sinceUnix: number,
  limit: number,
  report: StripeReconcileReport,
): Promise<void> {
  const refunds = await stripe.refunds.list({ created: { gte: sinceUnix }, limit: Math.min(limit, 100) });

  for (const refund of refunds.data) {
    if (refund.status !== "succeeded") continue;
    report.scanned.refunds += 1;
    if (await alreadyReconciled(refund.id)) continue;

    const piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    const orderId = piId ? await resolveOrderIdForDisputedPaymentIntent(piId) : null;
    if (!orderId) {
      await logReconcileResult(refund.id, "charge.refunded", true); // nothing local to reconcile against (e.g. a non-order charge)
      continue;
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, payoutStatus: true } });
    if (!order) continue;
    if (order.paymentStatus === "refunded" && order.payoutStatus === "blocked") {
      await logReconcileResult(refund.id, "charge.refunded", true);
      continue;
    }

    const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
    if (!chargeId) continue;
    const charge = await stripe.charges.retrieve(chargeId);
    await replay(report, "refund", "charge.refunded", refund.id, refund.status, orderId, charge);
  }
}

/**
 * Full Stripe <-> DB reconciliation pass. Idempotent and safe to rerun on any schedule — every
 * write path it can trigger is itself guarded against duplicate processing. Recommended schedule:
 * every 15 minutes (Checkout Sessions expire in 24h, so frequent, low-lookback runs catch a missed
 * webhook well before a buyer would notice or contact support).
 */
export async function reconcileStripeWithDatabase(opts?: {
  lookbackHours?: number;
  limitPerCheck?: number;
}): Promise<StripeReconcileReport> {
  const lookbackHours = opts?.lookbackHours ?? 24;
  const limit = opts?.limitPerCheck ?? 100;
  const configured = isStripeConfigured();
  const report = emptyReport(lookbackHours, configured);
  if (!configured) return { ...report, finishedAt: new Date().toISOString() };

  const stripe = getStripe();
  const sinceUnix = Math.floor(Date.now() / 1000) - lookbackHours * 3600;

  try {
    await reconcileCheckoutSessions(stripe, sinceUnix, limit, report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category: "checkout_session", stripeId: "list", kind: null, orderId: null, issue: msg });
    reportCronAnomaly("stripe-reconcile", `checkout session list failed: ${msg}`);
  }

  try {
    await reconcilePaymentIntents(stripe, sinceUnix, limit, report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category: "payment_intent", stripeId: "list", kind: null, orderId: null, issue: msg });
    reportCronAnomaly("stripe-reconcile", `payment intent list failed: ${msg}`);
  }

  try {
    await reconcileDisputes(stripe, sinceUnix, limit, report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category: "dispute", stripeId: "list", kind: null, orderId: null, issue: msg });
    reportCronAnomaly("stripe-reconcile", `dispute list failed: ${msg}`);
  }

  try {
    await reconcileRefunds(stripe, sinceUnix, limit, report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category: "refund", stripeId: "list", kind: null, orderId: null, issue: msg });
    reportCronAnomaly("stripe-reconcile", `refund list failed: ${msg}`);
  }

  try {
    const { reconcileStalePendingCheckoutSessionsGlobal } = await import("@/services/payments");
    const finalized = await reconcileStalePendingCheckoutSessionsGlobal(25);
    report.scanned.stalePendingOrdersChecked = 25;
    if (finalized > 0) {
      report.healed.push({
        category: "checkout_session",
        stripeId: "stale-pending-sweep",
        kind: null,
        orderId: null,
        issue: `Finalized ${finalized} stale pending order(s) via direct per-order session lookup.`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.errors.push({ category: "checkout_session", stripeId: "stale-pending-sweep", kind: null, orderId: null, issue: msg });
  }

  if (report.orphans.length > 0) {
    reportCronAnomaly("stripe-reconcile", `run completed with ${report.orphans.length} unresolved orphan(s) needing manual review`);
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
