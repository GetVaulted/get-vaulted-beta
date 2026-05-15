import { EscrowStatus } from "@/generated/prisma/enums";
import type { EscrowStatusChangeSource } from "@/lib/escrow-audit-log";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import { getEscrowProvider } from "@/services/escrow/factory";
import { assertValidEscrowTransition, EscrowInvalidTransitionError } from "@/services/escrow/state-machine";

export type EscrowOrderReleaseSlice = {
  id: string;
  sellerId: string;
  listingId: string | null;
  escrowTransactionId: string;
  escrowProvider: string | null;
};

/**
 * Invokes the escrow provider release after Vaulted is already `approved`.
 * On success, may advance DB to `funds_released` when the provider reports it.
 */
export async function releaseEscrowFundsFromApproved(args: {
  order: EscrowOrderReleaseSlice;
  auditSource: EscrowStatusChangeSource;
}): Promise<{ escrowStatus: EscrowStatus }> {
  const prov = getEscrowProvider();
  const releaseResult = await prov.releaseFunds(args.order.escrowTransactionId);

  try {
    assertValidEscrowTransition(EscrowStatus.approved, releaseResult.escrowStatus);
  } catch (e) {
    console.error("[releaseEscrowFundsFromApproved] invalid post-provider transition", args.order.id, e);
    if (e instanceof EscrowInvalidTransitionError) throw e;
    throw new EscrowInvalidTransitionError(EscrowStatus.approved, releaseResult.escrowStatus);
  }

  const prev = EscrowStatus.approved;
  const next = releaseResult.escrowStatus;
  const now = new Date();
  const data =
    next === EscrowStatus.funds_released
      ? { escrowStatus: EscrowStatus.funds_released, fundsReleasedAt: now }
      : { escrowStatus: next };

  await prisma.order.update({
    where: { id: args.order.id },
    data,
  });

  if (prev !== next) {
    await logEscrowStatusTransition({
      sellerId: args.order.sellerId,
      listingId: args.order.listingId,
      orderId: args.order.id,
      provider: args.order.escrowProvider,
      escrowTransactionId: args.order.escrowTransactionId,
      previousStatus: prev,
      newStatus: next,
      source: args.auditSource,
    });
  }

  return { escrowStatus: next };
}
