/**
 * PayPal Payouts API client for seller payout rail (v1).
 * Buyer checkout remains Stripe by default; Venmo buyer vault is in paypal-buyer-venmo.ts.
 */

import { getPayPalAccessToken, paypalApiBase, paypalCredentialsConfigured } from "@/lib/paypal-auth";

export type PayPalPayoutItemResult = {
  batchId: string;
  payoutItemId: string;
  feeCents: number | null;
  rawStatus: string;
};

/**
 * Seller PayPal payout rail. On when credentials are present unless explicitly disabled.
 * Set PAYPAL_SELLER_PAYOUTS_ENABLED=false to force off; =true is optional when creds exist.
 */
export function isPayPalSellerPayoutsEnabled(): boolean {
  if (process.env.PAYPAL_SELLER_PAYOUTS_ENABLED === "false") return false;
  return paypalCredentialsConfigured();
}

/** Create a single-item PayPal payout to a seller email. Idempotent via sender_batch_id. */
export async function createSellerPayPalPayout(args: {
  orderId: string;
  sellerEmail: string;
  amountUsd: number;
  note?: string;
}): Promise<PayPalPayoutItemResult> {
  if (!isPayPalSellerPayoutsEnabled()) {
    throw new Error("PAYPAL_SELLER_PAYOUTS_DISABLED");
  }
  const amount = Math.max(0, Math.round(args.amountUsd * 100) / 100);
  if (amount < 0.01) {
    throw new Error("PAYPAL_PAYOUT_AMOUNT_TOO_SMALL");
  }
  const token = await getPayPalAccessToken();
  const senderBatchId = `gv-order-${args.orderId}`.slice(0, 30);
  const res = await fetch(`${paypalApiBase()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: "You have a payout from Get Vaulted",
        email_message: args.note ?? `Payout for Get Vaulted order ${args.orderId}`,
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: amount.toFixed(2), currency: "USD" },
          receiver: args.sellerEmail.trim(),
          sender_item_id: args.orderId.slice(0, 30),
          note: args.note ?? `Get Vaulted order ${args.orderId}`,
        },
      ],
    }),
  });
  const rawText = await res.text();
  let json: {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    items?: Array<{
      payout_item_id?: string;
      transaction_status?: string;
      payout_item_fee?: { value?: string };
    }>;
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    // keep empty
  }
  if (!res.ok) {
    throw new Error(`PAYPAL_PAYOUT_FAILED:${res.status}:${rawText.slice(0, 300)}`);
  }
  const batchId = json.batch_header?.payout_batch_id?.trim();
  const item = json.items?.[0];
  const payoutItemId = item?.payout_item_id?.trim() || batchId;
  if (!batchId || !payoutItemId) {
    throw new Error(`PAYPAL_PAYOUT_FAILED:missing_ids:${rawText.slice(0, 200)}`);
  }
  const feeValue = item?.payout_item_fee?.value;
  const feeCents =
    feeValue != null && Number.isFinite(Number(feeValue)) ? Math.round(Number(feeValue) * 100) : null;
  return {
    batchId,
    payoutItemId,
    feeCents,
    rawStatus: item?.transaction_status ?? json.batch_header?.batch_status ?? "PENDING",
  };
}

/**
 * Verifies a PayPal webhook via PayPal's own `verify-webhook-signature` API — PayPal fetches
 * and validates its own signing cert server-side, so we never have to parse/trust a
 * client-supplied `paypal-cert-url` ourselves. Previously this only checked that the five
 * transmission headers were *present*, which any client can fabricate; that let a forged
 * request through as if it were a real PayPal event. Now every event is round-tripped through
 * PayPal to confirm `verification_status: "SUCCESS"` before we trust it.
 * When `PAYPAL_WEBHOOK_ID` is unset (local/dev), accept only if explicitly allowed.
 */
export async function verifyPayPalWebhookSignature(args: {
  headers: Headers;
  rawBody: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    return process.env.PAYPAL_WEBHOOK_ALLOW_UNSIGNED === "true";
  }

  const transmissionId = args.headers.get("paypal-transmission-id");
  const transmissionSig = args.headers.get("paypal-transmission-sig");
  const transmissionTime = args.headers.get("paypal-transmission-time");
  const certUrl = args.headers.get("paypal-cert-url");
  const authAlgo = args.headers.get("paypal-auth-algo");
  if (!transmissionId || !transmissionSig || !transmissionTime || !certUrl || !authAlgo) {
    return false;
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(args.rawBody);
  } catch {
    return false;
  }

  try {
    const token = await getPayPalAccessToken();
    const res = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[paypal webhook] verify-webhook-signature call failed", res.status, body.slice(0, 300));
      return false;
    }
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[paypal webhook] verify-webhook-signature error", e);
    return false;
  }
}
