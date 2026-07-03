import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructStripeWebhookEvent } from "@/lib/stripe";
import {
  createWebhookLogEntry,
  markWebhookLogFailure,
  markWebhookLogSkippedDuplicate,
  markWebhookLogSuccess,
  updateWebhookLogEntry,
} from "@/services/webhook-log";
import { processStripeWebhookEvent } from "@/services/payments";
import Stripe from "stripe";

export const runtime = "nodejs";

function isUniqueConstraintError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2002");
}

/**
 * Stripe Connect webhooks — source of truth for order payment state.
 * Events are logged to `WebhookEventLog` before processing; failures return non-2xx so Stripe can retry.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const { id: logId } = await createWebhookLogEntry({
    source: "stripe",
    eventType: "received",
    payload: raw,
  });

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(raw, req.headers.get("stripe-signature"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markWebhookLogFailure(logId, `verify: ${msg}`);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  await updateWebhookLogEntry(logId, { eventType: event.type, externalId: event.id });

  // Atomic claim on the Stripe event id: two concurrent deliveries of the same event race on
  // this insert (DB unique constraint), so only one can win — closing the old check-then-act gap
  // where both requests could pass a "processed" lookup before either finished. Do NOT fall back
  // to the legacy processed-flag lookup here; that reintroduces the race this replaces.
  try {
    await prisma.processedStripeEvent.create({ data: { id: event.id } });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      await markWebhookLogSkippedDuplicate(logId);
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe webhook] process", e);
    await markWebhookLogFailure(logId, `process: ${msg}`);
    // Release the claim so Stripe's automatic retry (same event id, non-2xx response) can
    // reprocess instead of being permanently skipped as a duplicate.
    await prisma.processedStripeEvent.deleteMany({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  await markWebhookLogSuccess(logId);
  return NextResponse.json({ received: true });
}
