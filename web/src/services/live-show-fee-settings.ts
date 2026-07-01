import { prisma } from "@/lib/prisma";

const CONFIG_ID = "default";
const CACHE_TTL_MS = 30_000;

/** Code fallback when DB is unavailable — keep aligned with platform-fee-policy.ts. */
const DEFAULT_TIER_1_FEE_PERCENT = 8;
const DEFAULT_TIER_2_THRESHOLD_USD = 1000;
const DEFAULT_TIER_2_FEE_PERCENT = 7.25;
const DEFAULT_TIER_3_THRESHOLD_USD = 3000;
const DEFAULT_TIER_3_FEE_PERCENT = 6.5;

export type LiveShowFeeConfig = {
  tier1FeePercent: number;
  tier2ThresholdUsd: number;
  tier2FeePercent: number;
  tier3ThresholdUsd: number;
  tier3FeePercent: number;
};

const DEFAULT_CONFIG: LiveShowFeeConfig = {
  tier1FeePercent: DEFAULT_TIER_1_FEE_PERCENT,
  tier2ThresholdUsd: DEFAULT_TIER_2_THRESHOLD_USD,
  tier2FeePercent: DEFAULT_TIER_2_FEE_PERCENT,
  tier3ThresholdUsd: DEFAULT_TIER_3_THRESHOLD_USD,
  tier3FeePercent: DEFAULT_TIER_3_FEE_PERCENT,
};

let cachedConfig: LiveShowFeeConfig | null = null;
let cachedAt = 0;

function clampFeePercent(raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(25, Math.max(0, Math.round(raw * 100) / 100));
}

function clampThreshold(raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.round(raw * 100) / 100);
}

export function normalizeLiveShowFeeConfig(raw: Partial<LiveShowFeeConfig>): LiveShowFeeConfig {
  const tier2ThresholdUsd = clampThreshold(raw.tier2ThresholdUsd ?? DEFAULT_CONFIG.tier2ThresholdUsd, DEFAULT_CONFIG.tier2ThresholdUsd);
  let tier3ThresholdUsd = clampThreshold(raw.tier3ThresholdUsd ?? DEFAULT_CONFIG.tier3ThresholdUsd, DEFAULT_CONFIG.tier3ThresholdUsd);
  if (tier3ThresholdUsd <= tier2ThresholdUsd) {
    tier3ThresholdUsd = tier2ThresholdUsd + 1;
  }

  return {
    tier1FeePercent: clampFeePercent(raw.tier1FeePercent ?? DEFAULT_CONFIG.tier1FeePercent, DEFAULT_CONFIG.tier1FeePercent),
    tier2ThresholdUsd: Math.max(1, tier2ThresholdUsd),
    tier2FeePercent: clampFeePercent(raw.tier2FeePercent ?? DEFAULT_CONFIG.tier2FeePercent, DEFAULT_CONFIG.tier2FeePercent),
    tier3ThresholdUsd,
    tier3FeePercent: clampFeePercent(raw.tier3FeePercent ?? DEFAULT_CONFIG.tier3FeePercent, DEFAULT_CONFIG.tier3FeePercent),
  };
}

/** Sync read — returns cached value or code default until cache is warmed. */
export function getCachedLiveShowFeeConfig(): LiveShowFeeConfig {
  if (cachedConfig != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  return DEFAULT_CONFIG;
}

export function invalidateLiveShowFeeCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

export async function ensureLiveShowFeeCache(force = false): Promise<LiveShowFeeConfig> {
  if (!force && cachedConfig != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const row = await prisma.platformLiveShowFeeConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    cachedConfig = normalizeLiveShowFeeConfig({
      tier1FeePercent: row?.tier1FeePercent,
      tier2ThresholdUsd: row?.tier2ThresholdUsd,
      tier2FeePercent: row?.tier2FeePercent,
      tier3ThresholdUsd: row?.tier3ThresholdUsd,
      tier3FeePercent: row?.tier3FeePercent,
    });
  } catch {
    cachedConfig = DEFAULT_CONFIG;
  }

  cachedAt = Date.now();
  return cachedConfig;
}

export async function getLiveShowFeeConfig(): Promise<{
  config: LiveShowFeeConfig;
  updatedAt: Date | null;
  updatedByUserId: string | null;
}> {
  const config = await ensureLiveShowFeeCache(true);
  try {
    const row = await prisma.platformLiveShowFeeConfig.findUnique({
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

export function liveShowFeeTiersFromConfig(config: LiveShowFeeConfig) {
  return [
    { label: "Base", thresholdUsd: 0, feePercent: config.tier1FeePercent },
    { label: "Volume", thresholdUsd: config.tier2ThresholdUsd, feePercent: config.tier2FeePercent },
    { label: "Top", thresholdUsd: config.tier3ThresholdUsd, feePercent: config.tier3FeePercent },
  ];
}

export async function setLiveShowFeeConfig(
  raw: Partial<LiveShowFeeConfig>,
  adminUserId?: string | null,
): Promise<LiveShowFeeConfig> {
  const next = normalizeLiveShowFeeConfig({
    ...getCachedLiveShowFeeConfig(),
    ...raw,
  });

  await prisma.platformLiveShowFeeConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      ...next,
      updatedByUserId: adminUserId?.trim() || null,
    },
    update: {
      ...next,
      updatedByUserId: adminUserId?.trim() || null,
    },
  });

  cachedConfig = next;
  cachedAt = Date.now();
  return next;
}
