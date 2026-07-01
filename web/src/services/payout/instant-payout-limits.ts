import { prisma } from "@/lib/prisma";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { getCachedPayoutProgramConfig } from "@/services/payout/payout-program-settings";
import { STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS } from "@/lib/stripe-instant-payout-reference";

/** @deprecated Use getCachedPayoutProgramConfig().instantLimits */
export const DEFAULT_INSTANT_PAYOUT_LIMITS = STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS.instantLimits;

export type InstantPayoutLimitCheck = {
  allowed: boolean;
  reason: string | null;
  violatedLimit: "per_order" | "daily" | "daily_count" | "outstanding" | null;
};

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function loadSellerInstantLimitOverrides(sellerId: string): Promise<{
  perOrderUsd: number;
  dailyUsd: number;
  maxDailyCount: number;
  maxOutstandingUsd: number;
}> {
  const platform = getCachedPayoutProgramConfig().instantLimits;
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      instantPayoutPerOrderLimitUsd: true,
      instantPayoutDailyLimitUsd: true,
      instantPayoutExposureLimitUsd: true,
    },
  });
  return {
    perOrderUsd: seller?.instantPayoutPerOrderLimitUsd ?? platform.perOrderUsd,
    dailyUsd: seller?.instantPayoutDailyLimitUsd ?? platform.dailyUsd,
    maxDailyCount: platform.maxDailyCount,
    maxOutstandingUsd: seller?.instantPayoutExposureLimitUsd ?? platform.maxOutstandingUsd,
  };
}

export async function checkInstantPayoutLimits(
  sellerId: string,
  orderPayoutUsd: number,
): Promise<InstantPayoutLimitCheck> {
  const limits = await loadSellerInstantLimitOverrides(sellerId);
  const metrics = await prisma.sellerPayoutMetrics.findUnique({
    where: { sellerId },
    select: {
      dailyInstantPayoutUsd: true,
      dailyInstantPayoutCount: true,
      dailyInstantPayoutResetAt: true,
      outstandingInstantPayoutUsd: true,
    },
  });

  const todayStart = startOfUtcDay();
  const resetAt = metrics?.dailyInstantPayoutResetAt;
  const sameDay = resetAt && resetAt >= todayStart;
  const dailyTotal = sameDay ? (metrics?.dailyInstantPayoutUsd ?? 0) : 0;
  const dailyCount = sameDay ? (metrics?.dailyInstantPayoutCount ?? 0) : 0;
  const outstanding = metrics?.outstandingInstantPayoutUsd ?? 0;
  const amount = Math.max(0, orderPayoutUsd);

  if (amount > limits.perOrderUsd) {
    return {
      allowed: false,
      reason: `Order payout $${amount.toFixed(2)} exceeds per-order instant limit $${limits.perOrderUsd}.`,
      violatedLimit: "per_order",
    };
  }
  if (dailyCount + 1 > limits.maxDailyCount) {
    return {
      allowed: false,
      reason: `Daily instant payout count would exceed ${limits.maxDailyCount} (current day: ${dailyCount}).`,
      violatedLimit: "daily_count",
    };
  }
  if (dailyTotal + amount > limits.dailyUsd) {
    return {
      allowed: false,
      reason: `Daily instant payout would exceed $${limits.dailyUsd} (current day: $${dailyTotal.toFixed(2)}).`,
      violatedLimit: "daily",
    };
  }
  if (outstanding + amount > limits.maxOutstandingUsd) {
    return {
      allowed: false,
      reason: `Outstanding instant exposure would exceed $${limits.maxOutstandingUsd} (current: $${outstanding.toFixed(2)}).`,
      violatedLimit: "outstanding",
    };
  }

  return { allowed: true, reason: null, violatedLimit: null };
}

/** Record instant payout volume after a successful instant release. */
export async function recordInstantPayoutRelease(
  sellerId: string,
  orderId: string,
  amountUsd: number,
): Promise<void> {
  const amount = Math.max(0, amountUsd);
  const todayStart = startOfUtcDay();

  const existing = await prisma.sellerPayoutMetrics.findUnique({
    where: { sellerId },
    select: {
      dailyInstantPayoutUsd: true,
      dailyInstantPayoutCount: true,
      dailyInstantPayoutResetAt: true,
    },
  });

  const resetDaily =
    !existing?.dailyInstantPayoutResetAt || existing.dailyInstantPayoutResetAt < todayStart;
  const nextDaily = resetDaily ? amount : (existing?.dailyInstantPayoutUsd ?? 0) + amount;
  const nextCount = resetDaily ? 1 : (existing?.dailyInstantPayoutCount ?? 0) + 1;

  await prisma.sellerPayoutMetrics.upsert({
    where: { sellerId },
    create: {
      sellerId,
      dailyInstantPayoutUsd: amount,
      dailyInstantPayoutCount: 1,
      dailyInstantPayoutResetAt: new Date(),
      outstandingInstantPayoutUsd: amount,
      lifetimeInstantPayoutUsd: amount,
    },
    update: {
      dailyInstantPayoutUsd: nextDaily,
      dailyInstantPayoutCount: nextCount,
      dailyInstantPayoutResetAt: new Date(),
      outstandingInstantPayoutUsd: { increment: amount },
      lifetimeInstantPayoutUsd: { increment: amount },
    },
  });
}

/** Reduce outstanding exposure when funds fully settle (delivery / hold release). */
export async function reduceOutstandingInstantExposure(
  sellerId: string,
  amountUsd: number,
): Promise<void> {
  const amount = Math.max(0, amountUsd);
  const row = await prisma.sellerPayoutMetrics.findUnique({ where: { sellerId } });
  if (!row) return;
  const next = Math.max(0, row.outstandingInstantPayoutUsd - amount);
  await prisma.sellerPayoutMetrics.update({
    where: { sellerId },
    data: { outstandingInstantPayoutUsd: next },
  });
}

export async function logInstantPayoutLimitFallback(args: {
  sellerId: string;
  orderId: string;
  reason: string;
  orderAmountUsd: number;
}): Promise<void> {
  await logPayoutEligibilityDecision({
    sellerId: args.sellerId,
    orderId: args.orderId,
    action: "order_instant_payout_limit_fallback",
    previousStatus: "instant",
    newStatus: "fast",
    reason: `${args.reason} (order $${args.orderAmountUsd.toFixed(2)})`,
  });
}
