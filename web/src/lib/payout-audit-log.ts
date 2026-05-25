import { prisma } from "@/lib/prisma";

export type PayoutAuditAction =
  | "seller_eligibility_evaluated"
  | "seller_instant_payout_enabled"
  | "seller_instant_payout_disabled"
  | "seller_instant_payout_suspended"
  | "seller_manual_review_required"
  | "order_payout_initialized"
  | "order_delivery_confirmed"
  | "order_instant_payout_ready"
  | "order_payout_held"
  | "order_payout_released"
  | "order_payout_blocked"
  | "order_manual_review"
  | "order_payout_evaluated";

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
