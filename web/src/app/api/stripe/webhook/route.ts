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

  const duplicate = await prisma.webhookEventLog.findFirst({
    where: {
      source: "stripe",
      externalId: event.id,
      processed: true,
      NOT: { id: logId },
    },
    select: { id: true },
  });
  if (duplicate) {
    await markWebhookLogSkippedDuplicate(logId);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe webhook] process", e);
    await markWebhookLogFailure(logId, `process: ${msg}`);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  await markWebhookLogSuccess(logId);
  return NextResponse.json({ received: true });
}
