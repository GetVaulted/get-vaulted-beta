import type { EscrowStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type EscrowStatusChangeSource = "webhook" | "admin" | "buyer" | "system";

export type EscrowAuditPayload = {
  orderId: string;
  provider: string | null;
  providerTransactionId: string | null;
  previousStatus: EscrowStatus | null;
  newStatus: EscrowStatus | null;
  source: EscrowStatusChangeSource;
  at: string;
};

const KIND = "escrow_status";

/**
 * Persists an escrow lifecycle change for seller timeline + ops audit (JSON body).
 * Best-effort: failures are logged and never break the primary flow.
 */
export async function logEscrowStatusTransition(args: {
  sellerId: string;
  listingId: string | null;
  orderId: string;
  provider: string | null;
  escrowTransactionId: string | null;
  previousStatus: EscrowStatus | null;
  newStatus: EscrowStatus | null;
  source: EscrowStatusChangeSource;
}): Promise<void> {
  if (args.previousStatus === args.newStatus) return;

  const at = new Date().toISOString();
  const payload: EscrowAuditPayload = {
    orderId: args.orderId,
    provider: args.provider,
    providerTransactionId: args.escrowTransactionId,
    previousStatus: args.previousStatus,
    newStatus: args.newStatus,
    source: args.source,
    at,
  };

  const prev = args.previousStatus ?? "—";
  const next = args.newStatus ?? "—";

  try {
    await prisma.sellerCommerceEvent.create({
      data: {
        sellerId: args.sellerId,
        listingId: args.listingId,
        orderId: args.orderId,
        kind: KIND,
        title: `Payment status: ${prev} → ${next}`,
        body: JSON.stringify(payload),
      },
    });
  } catch (e) {
    console.error("[escrow audit] failed to write SellerCommerceEvent", e);
  }
}
