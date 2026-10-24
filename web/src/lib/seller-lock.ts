import { prisma } from "@/lib/prisma";

/**
 * Targeted seller lock (admin-applied, reversible).
 *
 * While `User.sellerLockedAt` is set the seller:
 *  - cannot create or start a live show (enforced in `getSellerLiveReadiness`), and any show they have
 *    running is ended when the lock is applied;
 *  - cannot be paid out by ANY path: Stripe per-order release, lump-sum release, the seller's own "Get paid"
 *    button, PayPal release, and the automatic delivery/tier payout evaluators.
 *
 * Deliberately NOT blocked (this is not a suspension): login, messaging, shipping labels, order fulfilment,
 * and buyers' ability to keep their existing orders. Money already earned is untouched and keeps accruing in the
 * seller's balance; lifting the lock lets the normal payout flow pick it all back up.
 */

/** Machine reason returned by payout functions when the lock stops them. */
export const SELLER_LOCKED_PAYOUT_REASON = "seller_locked";

/** What the seller sees. Never includes the admin's internal reason. */
export const SELLER_LOCK_PUBLIC_MESSAGE =
  "Your selling account is on hold while we resolve an open issue. Please contact Get Vaulted support.";

export const SELLER_LOCK_REASON_MIN_LENGTH = 5;

export type SellerLockState = {
  locked: boolean;
  lockedAt: Date | null;
  reason: string | null;
  lockedById: string | null;
};

export function sellerLockFromRow(
  row: { sellerLockedAt?: Date | null; sellerLockReason?: string | null; sellerLockedById?: string | null } | null | undefined,
): SellerLockState {
  const lockedAt = row?.sellerLockedAt ?? null;
  return {
    locked: lockedAt != null,
    lockedAt,
    reason: lockedAt != null ? (row?.sellerLockReason ?? null) : null,
    lockedById: lockedAt != null ? (row?.sellerLockedById ?? null) : null,
  };
}

/** Read the lock for one seller. Unknown seller reads as unlocked (callers have their own not-found handling). */
export async function getSellerLock(sellerId: string): Promise<SellerLockState> {
  const id = sellerId.trim();
  if (!id) return sellerLockFromRow(null);
  const row = await prisma.user.findUnique({
    where: { id },
    select: { sellerLockedAt: true, sellerLockReason: true, sellerLockedById: true },
  });
  return sellerLockFromRow(row);
}

export async function isSellerLocked(sellerId: string): Promise<boolean> {
  return (await getSellerLock(sellerId)).locked;
}

/** Trimmed lock reason, or null when too short to be useful in an audit trail. */
export function normalizeSellerLockReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length >= SELLER_LOCK_REASON_MIN_LENGTH ? t.slice(0, 1000) : null;
}
