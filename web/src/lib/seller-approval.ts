import { prisma } from "@/lib/prisma";
import {
  sellerApprovalBlockMessage,
  type SellerApprovalState,
} from "@/lib/seller-application";

/**
 * Master switch for "no selling until approved". Off by default so the rollout can be reviewed
 * (grandfathered list, removals) before it affects anyone. Set SELLER_APPLICATIONS_ENFORCED=1 to turn on.
 */
export function isSellerApplicationsEnforced(): boolean {
  const v = process.env.SELLER_APPLICATIONS_ENFORCED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Approval state for a user. Platform admins are always treated as approved. */
export async function getSellerApprovalState(userId: string): Promise<SellerApprovalState> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, sellerApplication: { select: { status: true } } },
  });
  if (!row) return "not_applied";
  if (row.role === "admin") return "approved";
  return row.sellerApplication?.status ?? "not_applied";
}

/**
 * One line explaining why this user can't sell yet, or `null` when they can (or when the
 * feature flag is off). Safe to call from hot paths: returns immediately while disabled.
 * Fails open on a database error so an outage never blocks every seller.
 */
export async function getSellerApprovalIssue(userId: string): Promise<string | null> {
  if (!isSellerApplicationsEnforced()) return null;
  try {
    return sellerApprovalBlockMessage(await getSellerApprovalState(userId));
  } catch (e) {
    console.error("[seller-approval] lookup failed (allowing)", e);
    return null;
  }
}
