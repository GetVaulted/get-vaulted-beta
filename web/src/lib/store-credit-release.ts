import { prisma } from "@/lib/prisma";
import { releaseReferralCreditReservation } from "@/lib/referral-credit";
import { releasePlatformCreditReservation } from "@/lib/giveaway/platform-credit";

/**
 * Release any referral/platform credit reserved against an order AND restore the order's
 * `itemPriceUsd` / `referralCreditAppliedUsd` / `platformCreditAppliedUsd` back to their pre-credit
 * values.
 *
 * Releasing the credit rows alone (the old pattern — calling `releaseReferralCreditReservation` /
 * `releasePlatformCreditReservation` directly) frees the credit back to `available`, but leaves the
 * order's cached fields pointing at a discount that no longer has a matching reservation. If that
 * same order is retried, `applyStoreCreditsForSavedCardOrder`'s "already applied, don't re-reserve"
 * guard sees those non-zero fields and skips reserving fresh credit — the buyer still gets charged
 * the discounted amount, but no credit is ever committed to `spent`. The result: the buyer gets that
 * discount for free, and the same credit shows as available to spend again later.
 *
 * Always release checkout-failed/expired/abandoned credit through this helper, never by calling
 * the raw release functions directly against an order that might be retried.
 */
export async function releaseStoreCreditAndRestoreOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { itemPriceUsd: true, referralCreditAppliedUsd: true, platformCreditAppliedUsd: true },
  });
  if (!order) return;

  const referralUsd = Math.max(0, order.referralCreditAppliedUsd ?? 0);
  const platformUsd = Math.max(0, order.platformCreditAppliedUsd ?? 0);
  const restoreUsd = referralUsd + platformUsd;

  if (referralUsd > 0) {
    releaseReferralCreditReservation(orderId).catch((e) =>
      console.error("[referral-credit] release failed", { orderId, error: e }),
    );
  }
  if (platformUsd > 0) {
    releasePlatformCreditReservation(orderId).catch((e) =>
      console.error("[platform-credit] release failed", { orderId, error: e }),
    );
  }
  if (restoreUsd > 0.001) {
    await prisma.order
      .update({
        where: { id: orderId },
        data: {
          itemPriceUsd: order.itemPriceUsd + restoreUsd,
          referralCreditAppliedUsd: 0,
          platformCreditAppliedUsd: 0,
        },
      })
      .catch((e) =>
        console.error("[store-credit] failed to restore order fields after release", { orderId, error: e }),
      );
  }
}
