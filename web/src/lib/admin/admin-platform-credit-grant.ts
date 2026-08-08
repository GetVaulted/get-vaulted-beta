import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { PlatformCreditSourceType, PlatformCreditStatus } from "@/generated/prisma/enums";
import { awardPlatformCredit, getAvailablePlatformCreditUsd } from "@/lib/giveaway/draw";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";

export type AdminPlatformCreditRow = {
  id: string;
  amountUsd: number;
  status: string;
  sourceType: string;
  sourceRef: string;
  spentOrderId: string | null;
  spentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type AdminPlatformCreditSnapshot = {
  availableUsd: number;
  pendingUsd: number;
  spentUsd: number;
  voidedUsd: number;
  credits: AdminPlatformCreditRow[];
};

/** Full platform-credit ledger for a user, for the admin user detail page. */
export async function getAdminUserPlatformCreditSnapshot(userId: string): Promise<AdminPlatformCreditSnapshot> {
  const [availableUsd, rows] = await Promise.all([
    getAvailablePlatformCreditUsd(userId),
    prisma.platformCredit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  let pendingUsd = 0;
  let spentUsd = 0;
  let voidedUsd = 0;
  for (const r of rows) {
    if (r.status === PlatformCreditStatus.reserved) pendingUsd += r.amountUsd;
    else if (r.status === PlatformCreditStatus.spent) spentUsd += r.amountUsd;
    else if (r.status === PlatformCreditStatus.voided) voidedUsd += r.amountUsd;
  }

  return {
    availableUsd,
    pendingUsd: Math.round(pendingUsd * 100) / 100,
    spentUsd: Math.round(spentUsd * 100) / 100,
    voidedUsd: Math.round(voidedUsd * 100) / 100,
    credits: rows.map((r) => ({
      id: r.id,
      amountUsd: r.amountUsd,
      status: r.status,
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      spentOrderId: r.spentOrderId,
      spentAt: r.spentAt?.toISOString() ?? null,
      voidedAt: r.voidedAt?.toISOString() ?? null,
      voidReason: r.voidReason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Admin-initiated Get Vaulted Credit grant (support goodwill, compensation, promo, etc.).
 * Always logged to the payout/eligibility audit trail with the admin id + reason.
 */
export async function grantAdminPlatformCredit(args: {
  userId: string;
  amountUsd: number;
  reason: string;
  adminId: string;
}): Promise<{ id: string }> {
  const reason = args.reason.trim();
  if (!reason) throw new Error("reason_required");
  const amount = Math.round(Math.max(0, args.amountUsd) * 100) / 100;
  if (amount < 0.01) throw new Error("amount_too_small");

  const sourceRef = `admin_grant:${args.adminId}:${randomUUID()}`;
  const { id } = await awardPlatformCredit({
    userId: args.userId,
    amountUsd: amount,
    sourceType: PlatformCreditSourceType.admin_grant,
    sourceRef,
  });

  await logPayoutEligibilityDecision({
    sellerId: args.userId,
    adminId: args.adminId,
    action: "platform_credit_granted",
    newStatus: `$${amount.toFixed(2)}`,
    reason,
  });

  return { id };
}
