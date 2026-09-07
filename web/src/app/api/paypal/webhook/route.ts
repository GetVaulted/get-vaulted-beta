import { NextResponse } from "next/server";
import { verifyPayPalWebhookSignature } from "@/lib/paypal";
import { applyPayPalPayoutWebhookStatus } from "@/services/payout/paypal-seller-payout";

export const runtime = "nodejs";

/**
 * PayPal Payouts webhook — updates order.paypalPayoutStatus / manual_review on failure.
 * Configure PAYPAL_WEBHOOK_ID in production; local may set PAYPAL_WEBHOOK_ALLOW_UNSIGNED=true.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyPayPalWebhookSignature({ headers: req.headers, rawBody }))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    id?: string;
    event_type?: string;
    resource?: {
      payout_item_id?: string;
      payout_batch_id?: string;
      transaction_status?: string;
      batch_header?: { payout_batch_id?: string; batch_status?: string };
    };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = event.id?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  const resource = event.resource ?? {};
  const payoutItemId = resource.payout_item_id?.trim() ?? null;
  const batchId =
    resource.payout_batch_id?.trim() ??
    resource.batch_header?.payout_batch_id?.trim() ??
    null;
  const status =
    resource.transaction_status ??
    resource.batch_header?.batch_status ??
    event.event_type ??
    "UNKNOWN";

  try {
    await applyPayPalPayoutWebhookStatus({
      eventId,
      payoutItemId,
      batchId,
      status,
    });
  } catch (e) {
    console.error("[paypal webhook]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
