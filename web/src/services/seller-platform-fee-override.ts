import { prisma } from "@/lib/prisma";
import { clampMarketplacePlatformFeePercent } from "@/services/platform-fee-settings";

/** Max sellers with an active reduced-fee launch promo at once. */
export const LAUNCH_PROMO_SELLER_FEE_OVERRIDE_LIMIT = 20;

export function effectiveSellerPlatformFeePercentOverride(args: {
  percent: number | null | undefined;
  expiresAt: Date | null | undefined;
  now?: Date;
}): number | null {
  if (args.percent == null || !Number.isFinite(args.percent)) return null;
  const now = args.now ?? new Date();
  if (args.expiresAt && args.expiresAt <= now) return null;
  return clampMarketplacePlatformFeePercent(args.percent);
}

export function sellerPlatformFeeOverrideIsActive(args: {
  percent: number | null | undefined;
  expiresAt: Date | null | undefined;
  now?: Date;
}): boolean {
  return effectiveSellerPlatformFeePercentOverride(args) != null;
}

export function activeSellerPlatformFeeOverrideWhere(now = new Date()) {
  return {
    sellerPlatformFeePercentOverride: { not: null },
    OR: [{ sellerPlatformFeeOverrideExpiresAt: null }, { sellerPlatformFeeOverrideExpiresAt: { gt: now } }],
  };
}

export async function countActiveSellerPlatformFeeOverrides(now = new Date()): Promise<number> {
  return prisma.user.count({ where: activeSellerPlatformFeeOverrideWhere(now) });
}

export async function canAssignSellerPlatformFeeOverride(sellerId: string): Promise<{
  allowed: boolean;
  activeCount: number;
  max: number;
  sellerAlreadyActive: boolean;
}> {
  const max = LAUNCH_PROMO_SELLER_FEE_OVERRIDE_LIMIT;
  const now = new Date();
  const [activeCount, seller] = await Promise.all([
    countActiveSellerPlatformFeeOverrides(now),
    prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        sellerPlatformFeePercentOverride: true,
        sellerPlatformFeeOverrideExpiresAt: true,
      },
    }),
  ]);
  const sellerAlreadyActive = sellerPlatformFeeOverrideIsActive({
    percent: seller?.sellerPlatformFeePercentOverride,
    expiresAt: seller?.sellerPlatformFeeOverrideExpiresAt,
    now,
  });
  return {
    allowed: sellerAlreadyActive || activeCount < max,
    activeCount,
    max,
    sellerAlreadyActive,
  };
}

export async function loadSellerPlatformFeePercentOverride(sellerId: string): Promise<number | null> {
  const row = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      sellerPlatformFeePercentOverride: true,
      sellerPlatformFeeOverrideExpiresAt: true,
    },
  });
  if (!row) return null;
  return effectiveSellerPlatformFeePercentOverride({
    percent: row.sellerPlatformFeePercentOverride,
    expiresAt: row.sellerPlatformFeeOverrideExpiresAt,
  });
}
