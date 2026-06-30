import { prisma } from "@/lib/prisma";

const CONFIG_ID = "default";
const CACHE_TTL_MS = 30_000;
/** Code fallback when DB is unavailable — keep aligned with platform-fee-policy.ts. */
const FALLBACK_MARKETPLACE_FEE_PERCENT = 8;

let cachedPercent: number | null = null;
let cachedAt = 0;

export function formatMarketplaceFeeRateLabel(percent: number): string {
  const pct = clampMarketplacePlatformFeePercent(percent);
  const formatted = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "");
  return `${formatted}% of total sales`;
}

export function clampMarketplacePlatformFeePercent(raw: number): number {
  if (!Number.isFinite(raw)) return FALLBACK_MARKETPLACE_FEE_PERCENT;
  return Math.min(25, Math.max(0, Math.round(raw * 100) / 100));
}

/** Sync read — returns cached value or code default until cache is warmed. */
export function getCachedMarketplacePlatformFeePercent(): number {
  if (cachedPercent != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPercent;
  }
  return FALLBACK_MARKETPLACE_FEE_PERCENT;
}

export function invalidateMarketplacePlatformFeeCache(): void {
  cachedPercent = null;
  cachedAt = 0;
}

/** Load from DB and refresh in-memory cache (used by checkout + admin). */
export async function ensureMarketplacePlatformFeeCache(force = false): Promise<number> {
  if (!force && cachedPercent != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPercent;
  }

  try {
    const row = await prisma.platformMarketplaceFeeConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    cachedPercent = clampMarketplacePlatformFeePercent(
      row?.platformFeePercent ?? FALLBACK_MARKETPLACE_FEE_PERCENT,
    );
  } catch {
    cachedPercent = FALLBACK_MARKETPLACE_FEE_PERCENT;
  }

  cachedAt = Date.now();
  return cachedPercent;
}

export async function getMarketplacePlatformFeeConfig(): Promise<{
  platformFeePercent: number;
  updatedAt: Date | null;
  updatedByUserId: string | null;
}> {
  const percent = await ensureMarketplacePlatformFeeCache(true);
  try {
    const row = await prisma.platformMarketplaceFeeConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    return {
      platformFeePercent: percent,
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    };
  } catch {
    return { platformFeePercent: percent, updatedAt: null, updatedByUserId: null };
  }
}

export async function setMarketplacePlatformFeePercent(
  percent: number,
  adminUserId?: string | null,
): Promise<number> {
  const next = clampMarketplacePlatformFeePercent(percent);
  await prisma.platformMarketplaceFeeConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      platformFeePercent: next,
      updatedByUserId: adminUserId?.trim() || null,
    },
    update: {
      platformFeePercent: next,
      updatedByUserId: adminUserId?.trim() || null,
    },
  });
  cachedPercent = next;
  cachedAt = Date.now();
  return next;
}
