import { prisma } from "@/lib/prisma";

/**
 * Manual payout credits: money an admin put into a seller's Stripe Connect balance by hand (a transfer that is
 * not tied to any order). The seller's "Initiate Payout" button can send the unspent part of it to their bank.
 * The amount actually sent is always capped by the live Connect available balance (see seller-self-payout.ts).
 */

export type ManualCreditRow = {
  id: string;
  amountCents: number;
  usedCents: number;
};

/** Pure: unspent cents across credits. */
export function remainingCreditCents(rows: ReadonlyArray<{ amountCents: number; usedCents: number }>): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.amountCents - r.usedCents), 0);
}

/** Pure: split `cents` across credits oldest first. Returns how much to take from each credit. */
export function planCreditSpend(
  rowsOldestFirst: ReadonlyArray<ManualCreditRow>,
  cents: number,
): Array<{ id: string; takeCents: number; expectedUsedCents: number }> {
  let left = Math.max(0, Math.floor(cents));
  const out: Array<{ id: string; takeCents: number; expectedUsedCents: number }> = [];
  for (const r of rowsOldestFirst) {
    if (left <= 0) break;
    const open = Math.max(0, r.amountCents - r.usedCents);
    if (open <= 0) continue;
    const take = Math.min(open, left);
    out.push({ id: r.id, takeCents: take, expectedUsedCents: r.usedCents });
    left -= take;
  }
  return out;
}

/**
 * Unspent manual credit for a seller. Never throws: if the table is not there yet (migration not applied),
 * the seller's normal order payouts must keep working, so this returns 0.
 */
export async function getManualCreditRemainingCents(sellerId: string): Promise<number> {
  try {
    const rows = await prisma.sellerManualPayoutCredit.findMany({
      where: { sellerId },
      select: { amountCents: true, usedCents: true },
    });
    return remainingCreditCents(rows);
  } catch (e) {
    console.warn("[manual-payout-credit] lookup failed", {
      sellerId,
      error: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

/**
 * Reserve `cents` of the seller's credit (oldest first) BEFORE the Stripe payout is created, so a crash after
 * sending money can never leave the credit spendable twice. Returns the credits touched (for `releaseCreditSpend`)
 * or null when the credit changed underneath us (someone else spent it).
 */
export async function reserveManualCredit(
  sellerId: string,
  cents: number,
): Promise<Array<{ id: string; takeCents: number }> | null> {
  if (cents < 1) return [];
  return prisma.$transaction(async (tx) => {
    const rows = await tx.sellerManualPayoutCredit.findMany({
      where: { sellerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, amountCents: true, usedCents: true },
    });
    if (remainingCreditCents(rows) < cents) return null;
    const plan = planCreditSpend(rows, cents);
    for (const step of plan) {
      const res = await tx.sellerManualPayoutCredit.updateMany({
        where: { id: step.id, usedCents: step.expectedUsedCents },
        data: { usedCents: { increment: step.takeCents } },
      });
      if (res.count !== 1) throw new Error("manual_credit_changed");
    }
    return plan.map((p) => ({ id: p.id, takeCents: p.takeCents }));
  });
}

/** Give a reservation back (the Stripe payout did not go out). */
export async function releaseManualCreditReservation(
  reserved: ReadonlyArray<{ id: string; takeCents: number }>,
): Promise<void> {
  for (const r of reserved) {
    await prisma.sellerManualPayoutCredit.updateMany({
      where: { id: r.id, usedCents: { gte: r.takeCents } },
      data: { usedCents: { decrement: r.takeCents } },
    });
  }
}

export async function addManualPayoutCredit(args: {
  sellerId: string;
  amountCents: number;
  note?: string | null;
  adminId: string | null;
  stripeTransferId?: string | null;
}): Promise<{ id: string }> {
  const row = await prisma.sellerManualPayoutCredit.create({
    data: {
      sellerId: args.sellerId,
      amountCents: Math.floor(args.amountCents),
      note: args.note?.trim() ? args.note.trim().slice(0, 280) : null,
      createdByAdminId: args.adminId,
      stripeTransferId: args.stripeTransferId?.trim() || null,
    },
    select: { id: true },
  });
  await prisma.payoutEligibilityAuditLog
    .create({
      data: {
        sellerId: args.sellerId,
        adminId: args.adminId,
        action: "admin_manual_payout_credit_added",
        reason: `Manual payout credit $${(args.amountCents / 100).toFixed(2)}${args.stripeTransferId ? ` (${args.stripeTransferId})` : ""}${args.note ? `: ${args.note}` : ""}`,
      },
    })
    .catch(() => undefined);
  return row;
}
