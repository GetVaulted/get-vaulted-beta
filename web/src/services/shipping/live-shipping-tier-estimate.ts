import { resolveLiveShowShippingCapCents } from "@/lib/live-show-shipping-terms";
import type { PackageGroup } from "@/lib/unified-shipping-engine";

export type LiveShippingTier = { maxWeightOz: number; costCents: number };

const FALLBACK_TIERS: LiveShippingTier[] = [
  { maxWeightOz: 4, costCents: 399 },
  { maxWeightOz: 8, costCents: 499 },
  { maxWeightOz: 16, costCents: 599 },
  { maxWeightOz: 32, costCents: 799 },
  { maxWeightOz: 48, costCents: 999 },
  { maxWeightOz: Number.POSITIVE_INFINITY, costCents: 999 },
];

function parseTiersFromEnv(): LiveShippingTier[] | null {
  const raw = process.env.LIVE_SHIPPING_TIERS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const tiers = parsed
      .map((v) => ({
        maxWeightOz: Number((v as { maxWeightOz?: unknown }).maxWeightOz),
        costCents: Number((v as { costCents?: unknown }).costCents),
      }))
      .filter(
        (v) =>
          Number.isFinite(v.maxWeightOz) &&
          v.maxWeightOz > 0 &&
          Number.isFinite(v.costCents) &&
          v.costCents >= 0,
      )
      .sort((a, b) => a.maxWeightOz - b.maxWeightOz);
    return tiers.length > 0 ? tiers : null;
  } catch {
    return null;
  }
}

function effectiveTiers(): LiveShippingTier[] {
  return parseTiersFromEnv() ?? FALLBACK_TIERS;
}

export function calculateLiveShippingCost(weightOz: number, capCents?: number | null): number {
  if (!Number.isFinite(weightOz) || weightOz <= 0) return 0;
  const tiers = effectiveTiers();
  const row = tiers.find((tier) => weightOz <= tier.maxWeightOz) ?? tiers[tiers.length - 1];
  const computed = row?.costCents ?? 0;
  const cap = resolveLiveShowShippingCapCents(capCents ?? null);
  return Math.min(computed, cap);
}

/** Tier-table estimate for package groups (no Shippo). */
export function tierFallbackCentsForPackageGroups(
  groups: PackageGroup[],
  capCents?: number | null,
): number {
  const totalWeight = groups.reduce((s, g) => s + g.weightOz, 0);
  return calculateLiveShippingCost(totalWeight, capCents ?? null);
}
