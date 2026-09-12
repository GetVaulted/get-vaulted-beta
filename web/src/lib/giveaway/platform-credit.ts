import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { PlatformCreditSourceType, PlatformCreditStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const STALE_RESERVATION_MS = 24 * 60 * 60 * 1000;

/** Idempotent grant of spendable Get Vaulted Credit (not withdrawable). */
export async function awardPlatformCredit(args: {
  userId: string;
  amountUsd: number;
  sourceType: PlatformCreditSourceType;
  sourceRef: string;
}): Promise<{ id: string; created: boolean }> {
  const amount = Math.round(Math.max(0, args.amountUsd) * 100) / 100;
  if (amount < 0.01) throw new Error("amount_too_small");

  try {
    const row = await prisma.platformCredit.create({
      data: {
        userId: args.userId,
        amountUsd: amount,
        status: PlatformCreditStatus.available,
        sourceType: args.sourceType,
        sourceRef: args.sourceRef,
      },
      select: { id: true },
    });
    return { id: row.id, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.platformCredit.findUnique({
        where: {
          sourceType_sourceRef: { sourceType: args.sourceType, sourceRef: args.sourceRef },
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }
    throw e;
  }
}

export async function getAvailablePlatformCreditUsd(userId: string): Promise<number> {
  await releaseStalePlatformCreditReservations(userId);
  const rows = await prisma.platformCredit.findMany({
    where: { userId, status: PlatformCreditStatus.available },
    select: { amountUsd: true },
  });
  return Math.round(rows.reduce((s, r) => s + r.amountUsd, 0) * 100) / 100;
}

async function releaseStalePlatformCreditReservations(userId: string) {
  const cutoff = new Date(Date.now() - STALE_RESERVATION_MS);
  await prisma.platformCredit.updateMany({
    where: {
      userId,
      status: PlatformCreditStatus.reserved,
      reservedAt: { lt: cutoff },
    },
    data: {
      status: PlatformCreditStatus.available,
      reservedForRef: null,
      reservedAt: null,
    },
  });
}

export async function reservePlatformCreditForCheckout(
  userId: string,
  maxApplyUsd: number,
  checkoutRef: string,
): Promise<number> {
  await releaseStalePlatformCreditReservations(userId);
  const max = Math.max(0, maxApplyUsd);
  if (max < 0.01) return 0;

  const available = await prisma.platformCredit.findMany({
    where: { userId, status: PlatformCreditStatus.available },
    orderBy: { createdAt: "asc" },
  });

  let remaining = max;
  let reserved = 0;
  const now = new Date();
  for (const row of available) {
    if (remaining < 0.01) break;
    if (row.amountUsd <= remaining + 1e-9) {
      // Whole chunk fits within what's still needed — reserve it entirely.
      const updated = await prisma.platformCredit.updateMany({
        where: { id: row.id, status: PlatformCreditStatus.available },
        data: {
          status: PlatformCreditStatus.reserved,
          reservedForRef: checkoutRef,
          reservedAt: now,
        },
      });
      if (updated.count === 1) {
        reserved += row.amountUsd;
        remaining -= row.amountUsd;
      }
      continue;
    }

    // Chunk is bigger than what's needed (e.g. a $150 grant against a $19 purchase) — split it:
    // shrink the original available row and carve out a new reserved row for just the amount used.
    // Guarded by matching `amountUsd` in the WHERE so a concurrent reservation on the same row can
    // never cause us to shrink it twice or reserve more than actually exists.
    const splitUsd = Math.round(remaining * 100) / 100;
    const remainderUsd = Math.round((row.amountUsd - splitUsd) * 100) / 100;
    if (remainderUsd < 0.01) continue; // rounding edge case — leave the whole row for next pass

    const shrunk = await prisma.platformCredit.updateMany({
      where: { id: row.id, status: PlatformCreditStatus.available, amountUsd: row.amountUsd },
      data: { amountUsd: remainderUsd },
    });
    if (shrunk.count !== 1) continue; // lost the race to another reservation — try the next row

    await prisma.platformCredit.create({
      data: {
        userId,
        amountUsd: splitUsd,
        status: PlatformCreditStatus.reserved,
        sourceType: row.sourceType,
        sourceRef: `${row.sourceRef}:split:${randomUUID()}`,
        reservedForRef: checkoutRef,
        reservedAt: now,
      },
    });
    reserved += splitUsd;
    remaining -= splitUsd;
  }
  return Math.round(reserved * 100) / 100;
}

export async function commitPlatformCreditReservation(
  checkoutRef: string,
  spentOrderId: string,
): Promise<void> {
  const now = new Date();
  await prisma.platformCredit.updateMany({
    where: { reservedForRef: checkoutRef, status: PlatformCreditStatus.reserved },
    data: {
      status: PlatformCreditStatus.spent,
      spentOrderId,
      spentAt: now,
    },
  });
}

export async function releasePlatformCreditReservation(checkoutRef: string): Promise<void> {
  await prisma.platformCredit.updateMany({
    where: { reservedForRef: checkoutRef, status: PlatformCreditStatus.reserved },
    data: {
      status: PlatformCreditStatus.available,
      reservedForRef: null,
      reservedAt: null,
    },
  });
}

/**
 * Admin unstick: release every reservation on a user's credit back to available, regardless of
 * age. Normal reservations clear themselves within seconds (checkout succeeds or fails cleanly);
 * this is for the rare case where a checkout attempt died mid-flight and left credit stuck in
 * `reserved` limbo — the credit isn't lost, just invisible to `getAvailablePlatformCreditUsd`
 * until the 24h staleness sweep would otherwise clear it. Safe to call any time: it only ever
 * flips already-owned reserved credit back to available, never creates or destroys value.
 */
export async function releaseAllReservedPlatformCreditForUser(userId: string): Promise<{ releasedCount: number }> {
  const result = await prisma.platformCredit.updateMany({
    where: { userId, status: PlatformCreditStatus.reserved },
    data: {
      status: PlatformCreditStatus.available,
      reservedForRef: null,
      reservedAt: null,
    },
  });
  return { releasedCount: result.count };
}
