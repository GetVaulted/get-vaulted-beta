import { EscrowStatus } from "@/generated/prisma/enums";

/**
 * Centralized Vaulted escrow lifecycle rules (provider-agnostic).
 *
 * Allowed forward edges:
 * `pending`→`buyer_paid`→`seller_shipped`→`delivered`→`inspection_period` **or** `delivered`→`approved`,
 * `inspection_period`→`approved`→`funds_released`.
 *
 * Global: any non-terminal state may move to `disputed`; cancel to `cancelled` except from `cancelled` / `funds_released`.
 * Dev-only: `seller_shipped`→`approved`|`funds_released` when `allowSellerShippedRelease` mirrors env bypass.
 */

export class EscrowInvalidTransitionError extends Error {
  readonly previousStatus: EscrowStatus | null;
  readonly nextStatus: EscrowStatus;

  constructor(previousStatus: EscrowStatus | null, nextStatus: EscrowStatus, detail?: string) {
    const msg =
      detail ??
      `Invalid escrow transition: ${previousStatus === null ? "null" : previousStatus} → ${nextStatus}`;
    super(msg);
    this.name = "EscrowInvalidTransitionError";
    this.previousStatus = previousStatus;
    this.nextStatus = nextStatus;
  }
}

export type EscrowTransitionOptions = {
  /**
   * When true, allows `seller_shipped` → `approved` | `funds_released` (dev/test only;
   * mirrors `ESCROW_ALLOW_APPROVE_FROM_SELLER_SHIPPED`).
   */
  allowSellerShippedRelease?: boolean;
};

const forward: Partial<Record<EscrowStatus, EscrowStatus[]>> = {
  [EscrowStatus.pending]: [EscrowStatus.buyer_paid],
  [EscrowStatus.buyer_paid]: [EscrowStatus.seller_shipped],
  [EscrowStatus.seller_shipped]: [EscrowStatus.delivered],
  [EscrowStatus.delivered]: [EscrowStatus.inspection_period, EscrowStatus.approved],
  [EscrowStatus.inspection_period]: [EscrowStatus.approved],
  [EscrowStatus.approved]: [EscrowStatus.funds_released],
};

/** Cancelling is allowed from any in-flight state except already cancelled or funds released. */
function allowsCancelTo(previous: EscrowStatus): boolean {
  return previous !== EscrowStatus.cancelled && previous !== EscrowStatus.funds_released;
}

/** Dispute can be opened from any active-ish state except already disputed/cancelled. */
function allowsDisputeTo(previous: EscrowStatus): boolean {
  return previous !== EscrowStatus.disputed && previous !== EscrowStatus.cancelled;
}

function allowsPair(previous: EscrowStatus, next: EscrowStatus, opts?: EscrowTransitionOptions): boolean {
  const nexts = forward[previous];
  if (nexts?.includes(next)) return true;

  if (next === EscrowStatus.disputed && allowsDisputeTo(previous)) return true;

  if (next === EscrowStatus.cancelled && allowsCancelTo(previous)) return true;

  if (
    opts?.allowSellerShippedRelease &&
    previous === EscrowStatus.seller_shipped &&
    (next === EscrowStatus.approved || next === EscrowStatus.funds_released)
  ) {
    return true;
  }

  return false;
}

/**
 * Strict Vaulted escrow lifecycle: no skipping (e.g. `buyer_paid` → `funds_released` is rejected).
 * `null → pending` is the only initialization transition.
 */
export function assertValidEscrowTransition(
  previousStatus: EscrowStatus | null,
  nextStatus: EscrowStatus,
  opts?: EscrowTransitionOptions,
): void {
  if (nextStatus === previousStatus) return;

  if (previousStatus === null) {
    if (nextStatus === EscrowStatus.pending) return;
    throw new EscrowInvalidTransitionError(previousStatus, nextStatus);
  }

  if (allowsPair(previousStatus, nextStatus, opts)) return;

  throw new EscrowInvalidTransitionError(previousStatus, nextStatus);
}

/** For tests / diagnostics. */
export function isValidEscrowTransition(
  previousStatus: EscrowStatus | null,
  nextStatus: EscrowStatus,
  opts?: EscrowTransitionOptions,
): boolean {
  try {
    assertValidEscrowTransition(previousStatus, nextStatus, opts);
    return true;
  } catch {
    return false;
  }
}
