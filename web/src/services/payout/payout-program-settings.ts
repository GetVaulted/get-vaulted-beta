import { prisma } from "@/lib/prisma";
import {
  STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS,
  type PayoutProgramConfig,
} from "@/lib/stripe-instant-payout-reference";

const CONFIG_ID = "default";
const CACHE_TTL_MS = 30_000;

let cachedConfig: PayoutProgramConfig | null = null;
let cachedAt = 0;

function clampInt(raw: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function clampRate(raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(1, Math.max(0, Math.round(raw * 10_000) / 10_000));
}

function clampUsd(raw: number, fallback: number, min = 0, max = 1_000_000): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw * 100) / 100));
}

export function normalizePayoutProgramConfig(raw: Partial<PayoutProgramConfig>): PayoutProgramConfig {
  const base = STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS;
  const thresholds = raw.thresholds ?? base.thresholds;
  const instantLimits = raw.instantLimits ?? base.instantLimits;

  return {
    thresholds: {
      fast: {
        minAccountAgeDays: clampInt(
          thresholds.fast?.minAccountAgeDays ?? base.thresholds.fast.minAccountAgeDays,
          base.thresholds.fast.minAccountAgeDays,
          0,
          3650,
        ),
        minLifetimeGmvUsd: clampUsd(
          thresholds.fast?.minLifetimeGmvUsd ?? base.thresholds.fast.minLifetimeGmvUsd,
          base.thresholds.fast.minLifetimeGmvUsd,
        ),
        minCompletedOrders: clampInt(
          thresholds.fast?.minCompletedOrders ?? base.thresholds.fast.minCompletedOrders,
          base.thresholds.fast.minCompletedOrders,
          0,
          1_000_000,
        ),
      },
      instant: {
        minAccountAgeDays: clampInt(
          thresholds.instant?.minAccountAgeDays ?? base.thresholds.instant.minAccountAgeDays,
          base.thresholds.instant.minAccountAgeDays,
          0,
          3650,
        ),
        minLifetimeGmvUsd: clampUsd(
          thresholds.instant?.minLifetimeGmvUsd ?? base.thresholds.instant.minLifetimeGmvUsd,
          base.thresholds.instant.minLifetimeGmvUsd,
        ),
        maxCancellationRate: clampRate(
          thresholds.instant?.maxCancellationRate ?? base.thresholds.instant.maxCancellationRate,
          base.thresholds.instant.maxCancellationRate,
        ),
        maxChargebackRate: clampRate(
          thresholds.instant?.maxChargebackRate ?? base.thresholds.instant.maxChargebackRate,
          base.thresholds.instant.maxChargebackRate,
        ),
        maxDisputeRate: clampRate(
          thresholds.instant?.maxDisputeRate ?? base.thresholds.instant.maxDisputeRate,
          base.thresholds.instant.maxDisputeRate,
        ),
        maxUnresolvedDisputes: clampInt(
          thresholds.instant?.maxUnresolvedDisputes ?? base.thresholds.instant.maxUnresolvedDisputes,
          base.thresholds.instant.maxUnresolvedDisputes,
          0,
          100,
        ),
      },
    },
    instantLimits: {
      perOrderUsd: clampUsd(
        instantLimits.perOrderUsd ?? base.instantLimits.perOrderUsd,
        base.instantLimits.perOrderUsd,
        0,
        9_999,
      ),
      dailyUsd: clampUsd(
        instantLimits.dailyUsd ?? base.instantLimits.dailyUsd,
        base.instantLimits.dailyUsd,
      ),
      maxDailyCount: clampInt(
        instantLimits.maxDailyCount ?? base.instantLimits.maxDailyCount,
        base.instantLimits.maxDailyCount,
        1,
        100,
      ),
      maxOutstandingUsd: clampUsd(
        instantLimits.maxOutstandingUsd ?? base.instantLimits.maxOutstandingUsd,
        base.instantLimits.maxOutstandingUsd,
      ),
    },
    instantSuspensionRateCeiling: clampRate(
      raw.instantSuspensionRateCeiling ?? base.instantSuspensionRateCeiling,
      base.instantSuspensionRateCeiling,
    ),
  };
}

export function getCachedPayoutProgramConfig(): PayoutProgramConfig {
  if (cachedConfig != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  return STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS;
}

export function invalidatePayoutProgramCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

function rowToConfig(row: {
  fastMinAccountAgeDays: number;
  fastMinLifetimeGmvUsd: number;
  fastMinCompletedOrders: number;
  instantMinAccountAgeDays: number;
  instantMinLifetimeGmvUsd: number;
  instantMaxCancellationRate: number;
  instantMaxChargebackRate: number;
  instantMaxDisputeRate: number;
  instantMaxUnresolvedDisputes: number;
  instantPerOrderUsd: number;
  instantDailyUsd: number;
  instantMaxDailyCount: number;
  instantMaxOutstandingUsd: number;
  instantSuspensionRateCeiling: number;
}): PayoutProgramConfig {
  return normalizePayoutProgramConfig({
    thresholds: {
      fast: {
        minAccountAgeDays: row.fastMinAccountAgeDays,
        minLifetimeGmvUsd: row.fastMinLifetimeGmvUsd,
        minCompletedOrders: row.fastMinCompletedOrders,
      },
      instant: {
        minAccountAgeDays: row.instantMinAccountAgeDays,
        minLifetimeGmvUsd: row.instantMinLifetimeGmvUsd,
        maxCancellationRate: row.instantMaxCancellationRate,
        maxChargebackRate: row.instantMaxChargebackRate,
        maxDisputeRate: row.instantMaxDisputeRate,
        maxUnresolvedDisputes: row.instantMaxUnresolvedDisputes,
      },
    },
    instantLimits: {
      perOrderUsd: row.instantPerOrderUsd,
      dailyUsd: row.instantDailyUsd,
      maxDailyCount: row.instantMaxDailyCount,
      maxOutstandingUsd: row.instantMaxOutstandingUsd,
    },
    instantSuspensionRateCeiling: row.instantSuspensionRateCeiling,
  });
}

export async function ensurePayoutProgramCache(force = false): Promise<PayoutProgramConfig> {
  if (!force && cachedConfig != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const row = await prisma.platformPayoutProgramConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    cachedConfig = row ? rowToConfig(row) : STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS;
  } catch {
    cachedConfig = STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS;
  }

  cachedAt = Date.now();
  return cachedConfig;
}

export async function getPayoutProgramConfig(): Promise<{
  config: PayoutProgramConfig;
  updatedAt: Date | null;
  updatedByUserId: string | null;
}> {
  const config = await ensurePayoutProgramCache(true);
  try {
    const row = await prisma.platformPayoutProgramConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    return {
      config,
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    };
  } catch {
    return { config, updatedAt: null, updatedByUserId: null };
  }
}

export async function setPayoutProgramConfig(
  raw: Partial<PayoutProgramConfig>,
  adminUserId?: string | null,
): Promise<PayoutProgramConfig> {
  const next = normalizePayoutProgramConfig({
    ...getCachedPayoutProgramConfig(),
    ...raw,
    thresholds: {
      fast: { ...getCachedPayoutProgramConfig().thresholds.fast, ...raw.thresholds?.fast },
      instant: { ...getCachedPayoutProgramConfig().thresholds.instant, ...raw.thresholds?.instant },
    },
    instantLimits: { ...getCachedPayoutProgramConfig().instantLimits, ...raw.instantLimits },
  });

  await prisma.platformPayoutProgramConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      fastMinAccountAgeDays: next.thresholds.fast.minAccountAgeDays,
      fastMinLifetimeGmvUsd: next.thresholds.fast.minLifetimeGmvUsd,
      fastMinCompletedOrders: next.thresholds.fast.minCompletedOrders,
      instantMinAccountAgeDays: next.thresholds.instant.minAccountAgeDays,
      instantMinLifetimeGmvUsd: next.thresholds.instant.minLifetimeGmvUsd,
      instantMaxCancellationRate: next.thresholds.instant.maxCancellationRate,
      instantMaxChargebackRate: next.thresholds.instant.maxChargebackRate,
      instantMaxDisputeRate: next.thresholds.instant.maxDisputeRate,
      instantMaxUnresolvedDisputes: next.thresholds.instant.maxUnresolvedDisputes,
      instantPerOrderUsd: next.instantLimits.perOrderUsd,
      instantDailyUsd: next.instantLimits.dailyUsd,
      instantMaxDailyCount: next.instantLimits.maxDailyCount,
      instantMaxOutstandingUsd: next.instantLimits.maxOutstandingUsd,
      instantSuspensionRateCeiling: next.instantSuspensionRateCeiling,
      updatedByUserId: adminUserId?.trim() || null,
    },
    update: {
      fastMinAccountAgeDays: next.thresholds.fast.minAccountAgeDays,
      fastMinLifetimeGmvUsd: next.thresholds.fast.minLifetimeGmvUsd,
      fastMinCompletedOrders: next.thresholds.fast.minCompletedOrders,
      instantMinAccountAgeDays: next.thresholds.instant.minAccountAgeDays,
      instantMinLifetimeGmvUsd: next.thresholds.instant.minLifetimeGmvUsd,
      instantMaxCancellationRate: next.thresholds.instant.maxCancellationRate,
      instantMaxChargebackRate: next.thresholds.instant.maxChargebackRate,
      instantMaxDisputeRate: next.thresholds.instant.maxDisputeRate,
      instantMaxUnresolvedDisputes: next.thresholds.instant.maxUnresolvedDisputes,
      instantPerOrderUsd: next.instantLimits.perOrderUsd,
      instantDailyUsd: next.instantLimits.dailyUsd,
      instantMaxDailyCount: next.instantLimits.maxDailyCount,
      instantMaxOutstandingUsd: next.instantLimits.maxOutstandingUsd,
      instantSuspensionRateCeiling: next.instantSuspensionRateCeiling,
      updatedByUserId: adminUserId?.trim() || null,
    },
  });

  cachedConfig = next;
  cachedAt = Date.now();
  return next;
}
