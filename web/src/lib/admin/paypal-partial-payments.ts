import { prisma } from "@/lib/prisma";
import { getPayPalSellerBalance } from "@/lib/admin/paypal-payout-queue";

export async function sellerHasOpenPartialPayment(sellerId: string): Promise<boolean> {
  const n = await prisma.sellerPayPalPartialPayment.count({
    where: { sellerId, settledAt: null, voidedAt: null },
  });
  return n > 0;
}

export type RecordPartialResult =
  | { ok: true; id: string; amountUsd: number; remainingUsd: number }
  | { ok: false; error: string };

/**
 * Admin: record that you already sent a seller PART of what they're owed (off-platform). Never
 * calls PayPal or moves money — it only reduces the remaining balance shown on the PayPal payouts
 * page and blocks the automatic payout for that seller so they can't be paid twice.
 */
export async function recordSellerPayPalPartialPayment(args: {
  sellerId: string;
  adminId: string;
  amountUsd: number;
  note?: string | null;
}): Promise<RecordPartialResult> {
  const sellerId = args.sellerId.trim();
  if (!sellerId) return { ok: false, error: "sellerId required" };
  if (!Number.isFinite(args.amountUsd) || args.amountUsd <= 0) {
    return { ok: false, error: "Enter an amount greater than $0." };
  }
  const amountCents = Math.round(args.amountUsd * 100);
  if (amountCents < 1) return { ok: false, error: "Enter an amount greater than $0." };

  const balance = await getPayPalSellerBalance(sellerId);
  if (!balance || balance.orderCount === 0) {
    return { ok: false, error: "This seller has no unpaid PayPal orders." };
  }
  const remainingCents = Math.round(balance.remainingUsd * 100);
  if (amountCents > remainingCents) {
    return {
      ok: false,
      error: `That is more than the remaining balance ($${(remainingCents / 100).toFixed(2)}). Use Mark paid to settle it in full.`,
    };
  }

  const row = await prisma.sellerPayPalPartialPayment.create({
    data: {
      sellerId,
      adminId: args.adminId,
      amountCents,
      note: args.note?.trim() ? args.note.trim().slice(0, 300) : null,
    },
    select: { id: true },
  });
  return {
    ok: true,
    id: row.id,
    amountUsd: amountCents / 100,
    remainingUsd: (remainingCents - amountCents) / 100,
  };
}

/** Undo a mistaken partial payment entry (kept for audit, just excluded from the balance). */
export async function voidSellerPayPalPartialPayment(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await prisma.sellerPayPalPartialPayment.updateMany({
    where: { id: args.id, settledAt: null, voidedAt: null },
    data: { voidedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, error: "That entry was not found or is already settled." };
  return { ok: true };
}

/** Mark a seller's open partial payments as settled (called when their balance is marked paid in full). */
export async function settleOpenPartialPayments(sellerId: string): Promise<number> {
  const res = await prisma.sellerPayPalPartialPayment.updateMany({
    where: { sellerId, settledAt: null, voidedAt: null },
    data: { settledAt: new Date() },
  });
  return res.count;
}
