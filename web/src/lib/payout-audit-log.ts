import { prisma } from "@/lib/prisma";

export type PayoutAuditAction =
  | "seller_eligibility_evaluated"
  | "seller_instant_payout_enabled"
  | "seller_instant_payout_disabled"
  | "seller_instant_payout_suspended"
  | "seller_manual_review_required"
  | "seller_payout_tier_recalculated"
  | "seller_fast_payout_granted"
  | "seller_fast_payout_removed"
  | "seller_instant_payout_approved"
  | "seller_instant_payout_revoked"
  | "order_fast_payout_ready"
  | "order_label_payout_ready"
  | "seller_instant_payout_eligible"
  | "seller_instant_payout_under_review"
  | "seller_instant_payout_rejected"
  | "seller_instant_payout_restored"
  | "seller_level_changed"
  | "seller_elite_vault_verified_assigned"
  | "seller_elite_vault_verified_removed"
  | "seller_instant_limit_override"
  | "order_instant_payout_limit_fallback"
  | "order_payout_initialized"
  | "order_delivery_confirmed"
  | "order_instant_payout_ready"
  | "order_payout_held"
  | "order_payout_released"
  | "order_payout_blocked"
  | "order_manual_review"
  | "order_payout_evaluated"
  /**
   * Heuristic (not Stripe-object-confirmed) bulk bank-payout detection — see
   * reconcile-stripe-bank-payouts.ts. These mark `paid_out` from an ESTIMATED seller net
   * compared against Stripe's Connect balance, not a specific matched payout id. Distinct
   * action names so these can be found/reviewed/reversed separately from confirmed matches.
   */
  | "order_payout_marked_paid_from_connect_shortfall_heuristic"
  | "order_payout_marked_paid_from_full_clear_heuristic";

/** Best-effort audit log for payout eligibility decisions and admin overrides. */
export async function logPayoutEligibilityDecision(args: {
  sellerId: string;
  orderId?: string | null;
  adminId?: string | null;
  action: PayoutAuditAction | string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    await prisma.payoutEligibilityAuditLog.create({
      data: {
        sellerId: args.sellerId,
        orderId: args.orderId ?? null,
        adminId: args.adminId ?? null,
        action: args.action,
        previousStatus: args.previousStatus ?? null,
        newStatus: args.newStatus ?? null,
        reason: args.reason ?? null,
      },
    });
  } catch (e) {
    console.error("[payout audit] failed to write PayoutEligibilityAuditLog", e);
  }
}
