import type { ShippoParcel } from "@/lib/shippo";

const WEIGHT_TIERS = new Set([
  "cards_slabs",
  "sneakers",
  "memorabilia",
  "watches_luxury",
  "oversized_custom",
]);

const TRADE_WEIGHT_TIER_TO_PROFILE_SLUG: Record<string, string> = {
  cards_slabs: "graded_card",
  sneakers: "sneakers",
  memorabilia: "funko_collectible",
  watches_luxury: "watch",
  oversized_custom: "full_size_helmet",
};

const UNIFIED_PROFILE_PARCELS: Record<string, { length: string; width: string; height: string; weightOz: number }> = {
  graded_card: { length: "10", width: "8", height: "2", weightOz: 8 },
  sneakers: { length: "14", width: "10", height: "6", weightOz: 48 },
  funko_collectible: { length: "10", width: "8", height: "6", weightOz: 16 },
  watch: { length: "6", width: "4", height: "3", weightOz: 8 },
  full_size_helmet: { length: "16", width: "14", height: "12", weightOz: 80 },
};

function ozToShippoMass(weightOz: number): { weight: string; mass_unit: "oz" | "lb" } {
  if (weightOz >= 16) {
    return { weight: String(Math.max(1, Math.round((weightOz / 16) * 10) / 10)), mass_unit: "lb" };
  }
  return { weight: String(Math.max(1, weightOz)), mass_unit: "oz" };
}

export function normalizeTradeWeightTier(tier: string | null | undefined): string {
  const t = tier?.trim();
  if (t && WEIGHT_TIERS.has(t)) return t;
  return "cards_slabs";
}

/** Default outbound parcel for a trade weight tier. */
export function defaultTradeParcelForTier(tier: string | null | undefined): ShippoParcel {
  const normalized = normalizeTradeWeightTier(tier);
  const slug = TRADE_WEIGHT_TIER_TO_PROFILE_SLUG[normalized];
  const unified = slug ? UNIFIED_PROFILE_PARCELS[slug] : null;
  if (unified) {
    const mass = ozToShippoMass(unified.weightOz);
    return {
      length: unified.length,
      width: unified.width,
      height: unified.height,
      distance_unit: "in",
      weight: mass.weight,
      mass_unit: mass.mass_unit,
    };
  }
  return {
    length: "8",
    width: "6",
    height: "2",
    distance_unit: "in",
    weight: "1",
    mass_unit: "lb",
  };
}
