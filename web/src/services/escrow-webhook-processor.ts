import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import {
  mapTrustapTransactionStatus,
  mapTrustapWebhookEventCode,
  refineEscrowStatusFromTrustapPreview,
} from "@/services/escrow/trustap-status-map";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";
import { PAYMENT_PENDING, applyEscrowBuyerFundsSecured } from "@/services/payments";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Applies Trustap webhook payload to the matching `Order`.
 * @param transactionId Trustap `target_id` (stringified transaction id).
 * @param eventCode Trustap `code` e.g. `basic_tx.paid`.
 * @param targetPreview optional `target_preview` object from webhook.
 */
export async function applyTrustapEscrowWebhookToOrder(args: {
  transactionId: string;
  eventCode: string;
  targetPreview?: Record<string, unknown> | null;
  orderIdHint?: string | null;
}): Promise<{ orderId: string | null; mapped: EscrowStatus | null }> {
  let mapped = mapTrustapWebhookEventCode(args.eventCode);
  const preview = args.targetPreview ?? null;
  if (!mapped && preview) {
    const st = String(preview.status ?? "");
    mapped = mapTrustapTransactionStatus(st);
  }
  if (!mapped) {
    return { orderId: null, mapped: null };
  }
  mapped = refineEscrowStatusFromTrustapPreview(mapped, preview);

  const orderSelect = {
    id: true,
    sellerId: true,
    listingId: true,
    paymentStatus: true,
    escrowStatus: true,
    escrowReleasePaused: true,
    escrowProvider: true,
    escrowTransactionId: true,
  } as const;

  let order = await prisma.order.findFirst({
    where: { paymentMethod: OrderPaymentMethod.escrow, escrowTransactionId: args.transactionId },
    select: orderSelect,
  });
  if (!order && args.orderIdHint) {
    order = await prisma.order.findFirst({
      where: { id: args.orderIdHint, paymentMethod: OrderPaymentMethod.escrow },
      select: orderSelect,
    });
  }
  if (!order) {
    return { orderId: null, mapped };
  }

  if (order.escrowReleasePaused && mapped === EscrowStatus.funds_released) {
    return { orderId: order.id, mapped: null };
  }

  const previousEscrowStatus = order.escrowStatus;

  assertValidEscrowTransition(previousEscrowStatus, mapped);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      escrowStatus: mapped,
      ...(mapped === EscrowStatus.funds_released ? { fundsReleasedAt: new Date() } : {}),
    },
  });

  if (previousEscrowStatus !== mapped) {
    await logEscrowStatusTransition({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      provider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId ?? args.transactionId,
      previousStatus: previousEscrowStatus,
      newStatus: mapped,
      source: "webhook",
    });
  }

  if (
    mapped === EscrowStatus.buyer_paid &&
    order.paymentStatus === PAYMENT_PENDING &&
    previousEscrowStatus !== EscrowStatus.disputed
  ) {
    await applyEscrowBuyerFundsSecured(order.id);
  }

  return { orderId: order.id, mapped };
}
