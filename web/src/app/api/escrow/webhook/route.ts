import { NextResponse } from "next/server";
import { isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import { prisma } from "@/lib/prisma";
import { applyTrustapEscrowWebhookToOrder } from "@/services/escrow-webhook-processor";
import { EscrowInvalidTransitionError } from "@/services/escrow/state-machine";
import { verifyTrustapWebhookBasicAuth } from "@/services/escrow/trustap-webhook-auth";

export const runtime = "nodejs";

/**
 * Trustap webhooks — **HTTP Basic** auth per Trustap docs (username + password you configure with Trustap).
 * Invalid or missing credentials always return 401; the body is not processed.
 */
export async function POST(req: Request) {
  if (!isEscrowFeaturesEnabled()) {
    return NextResponse.json({ ok: true, ignored: true, reason: "escrow_features_disabled" });
  }

  if (!verifyTrustapWebhookBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventCode = String(body.code ?? "").trim();
  const transactionId = String(body.target_id ?? "").trim();
  const targetPreview =
    body.target_preview && typeof body.target_preview === "object" && body.target_preview !== null
      ? (body.target_preview as Record<string, unknown>)
      : null;
  const metadata = body.metadata && typeof body.metadata === "object" && body.metadata !== null
    ? (body.metadata as Record<string, unknown>)
    : null;
  const orderIdHint = metadata?.orderId != null ? String(metadata.orderId) : "";

  if (!transactionId || !eventCode) {
    return NextResponse.json({ error: "target_id and code required" }, { status: 400 });
  }

  try {
    const result = await applyTrustapEscrowWebhookToOrder({
      transactionId,
      eventCode,
      targetPreview,
      orderIdHint: orderIdHint || null,
    });

    await prisma.webhookEventLog
      .create({
        data: {
          source: "escrow_trustap",
          eventType: eventCode,
          externalId: transactionId,
          payload: raw.slice(0, 50_000),
          processed: Boolean(result.orderId && result.mapped),
          error: result.orderId && result.mapped ? null : "order_not_found_or_unhandled_event",
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, orderId: result.orderId, mapped: result.mapped });
  } catch (e) {
    if (e instanceof EscrowInvalidTransitionError) {
      console.error("[escrow/webhook] invalid escrow transition", e.previousStatus, "→", e.nextStatus);
      await prisma.webhookEventLog
        .create({
          data: {
            source: "escrow_trustap",
            eventType: eventCode,
            externalId: transactionId,
            payload: raw.slice(0, 50_000),
            processed: false,
            error: "invalid_escrow_transition",
          },
        })
        .catch(() => {});
      return NextResponse.json(
        { error: e.message, code: "INVALID_ESCROW_TRANSITION" },
        { status: 409 },
      );
    }
    console.error("[escrow/webhook]", e);
    await prisma.webhookEventLog
      .create({
        data: {
          source: "escrow_trustap",
          eventType: eventCode,
          externalId: transactionId,
          payload: raw.slice(0, 50_000),
          processed: false,
          error: e instanceof Error ? e.message : "error",
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
