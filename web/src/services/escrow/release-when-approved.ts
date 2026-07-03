import { EscrowStatus } from "@/generated/prisma/enums";
import type { EscrowStatusChangeSource } from "@/lib/escrow-audit-log";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import { getEscrowProvider } from "@/services/escrow/factory";
import { assertValidEscrowTransition, EscrowInvalidTransitionError } from "@/services/escrow/state-machine";
import type { ReleaseFundsResult } from "@/services/escrow/types";

export type EscrowOrderReleaseSlice = {
  id: string;
  sellerId: string;
  listingId: string | null;
  escrowTransactionId: string;
  escrowProvider: string | null;
};

/** Thrown when another release attempt already holds the claim on this order (or it already moved on). */
export class EscrowReleaseAlreadyInFlightError extends Error {
  constructor(orderId: string) {
    super(`Escrow release already in flight or no longer approved for order ${orderId}`);
    this.name = "EscrowReleaseAlreadyInFlightError";
  }
}

/**
 * Invokes the escrow provider release after Vaulted is already `approved`.
 * On success, may advance DB to `funds_released` when the provider reports it.
 *
 * A buyer's manual approve, an admin action, and the delivery/payout-tier cron can all race to
 * release the same order at nearly the same moment. `escrowReleaseInFlight` is an atomic mutex:
 * the update below only succeeds for one caller (its WHERE clause requires `approved` +
 * not-already-in-flight), so a second concurrent caller fails the claim and bails out here
 * instead of calling the escrow provider's release endpoint twice for the same funds.
 */
export async function releaseEscrowFundsFromApproved(args: {
  order: EscrowOrderReleaseSlice;
  auditSource: EscrowStatusChangeSource;
}): Promise<{ escrowStatus: EscrowStatus }> {
  const claim = await prisma.order.updateMany({
    where: { id: args.order.id, escrowStatus: EscrowStatus.approved, escrowReleaseInFlight: false },
    data: { escrowReleaseInFlight: true },
  });
  if (claim.count === 0) {
    throw new EscrowReleaseAlreadyInFlightError(args.order.id);
  }

  let releaseResult: ReleaseFundsResult;
  try {
    const prov = getEscrowProvider();
    releaseResult = await prov.releaseFunds(args.order.escrowTransactionId);
  } catch (e) {
    // Release the claim so a subsequent retry (not a concurrent racer) can attempt again.
    await prisma.order
      .update({ where: { id: args.order.id }, data: { escrowReleaseInFlight: false } })
      .catch(() => {});
    throw e;
  }

  try {
    assertValidEscrowTransition(EscrowStatus.approved, releaseResult.escrowStatus);
  } catch (e) {
    console.error("[releaseEscrowFundsFromApproved] invalid post-provider transition", args.order.id, e);
    await prisma.order
      .update({ where: { id: args.order.id }, data: { escrowReleaseInFlight: false } })
      .catch(() => {});
    if (e instanceof EscrowInvalidTransitionError) throw e;
    throw new EscrowInvalidTransitionError(EscrowStatus.approved, releaseResult.escrowStatus);
  }

  const prev = EscrowStatus.approved;
  const next = releaseResult.escrowStatus;
  const now = new Date();
  const data =
    next === EscrowStatus.funds_released
      ? { escrowStatus: EscrowStatus.funds_released, fundsReleasedAt: now, escrowReleaseInFlight: false }
      : { escrowStatus: next, escrowReleaseInFlight: false };

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
