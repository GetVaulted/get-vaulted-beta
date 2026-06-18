/** Preset labels for fast variant / spot setup in live queue items. */

import { TEAM_BOARD_SETS, TEAM_BOARD_DISPLAY_NAMES } from "@/lib/team-board-sets";

export type LiveItemVariantPresetId = "nfl_divisions" | "nfl_teams" | "custom";

export type LiveItemVariantPresetOption = {
  label: string;
  sortOrder: number;
  /** NFL team abbreviation when preset is nfl_teams. */
  abbr?: string;
};

export const NFL_DIVISIONS_PRESET: LiveItemVariantPresetOption[] = [
  { label: "AFC East", sortOrder: 0 },
  { label: "AFC North", sortOrder: 1 },
  { label: "AFC South", sortOrder: 2 },
  { label: "AFC West", sortOrder: 3 },
  { label: "NFC East", sortOrder: 4 },
  { label: "NFC North", sortOrder: 5 },
  { label: "NFC South", sortOrder: 6 },
  { label: "NFC West", sortOrder: 7 },
];

export const NFL_TEAMS_PRESET: LiveItemVariantPresetOption[] = TEAM_BOARD_SETS.nfl.map((abbr, sortOrder) => ({
  label: TEAM_BOARD_DISPLAY_NAMES.nfl[abbr] ?? abbr,
  sortOrder,
  abbr,
}));

export const LIVE_ITEM_VARIANT_PRESETS: Record<
  Exclude<LiveItemVariantPresetId, "custom">,
  { label: string; options: LiveItemVariantPresetOption[] }
> = {
  nfl_divisions: {
    label: "NFL Divisions (PYD)",
    options: NFL_DIVISIONS_PRESET,
  },
  nfl_teams: {
    label: "NFL Teams (PYT)",
    options: NFL_TEAMS_PRESET,
  },
};

export type VariantDraftInput = {
  label: string;
  priceUsd: number;
  quantityInitial?: number;
  isHot?: boolean;
  sortOrder?: number;
  imageUrl?: string;
  color?: string;
};

export function buildVariantsFromPreset(
  presetId: Exclude<LiveItemVariantPresetId, "custom">,
  defaultPriceUsd: number,
  defaultQty = 1,
): VariantDraftInput[] {
  const preset = LIVE_ITEM_VARIANT_PRESETS[presetId];
  return preset.options.map((o) => ({
    label: o.label,
    priceUsd: defaultPriceUsd,
    quantityInitial: defaultQty,
    sortOrder: o.sortOrder,
    color: o.abbr ?? "",
  }));
}

export function normalizeVariantDrafts(raw: unknown): VariantDraftInput[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantDraftInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const label = typeof (row as { label?: unknown }).label === "string" ? (row as { label: string }).label.trim().slice(0, 120) : "";
    if (!label) continue;
    const priceRaw = (row as { priceUsd?: unknown }).priceUsd;
    const priceUsd = typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
    const qtyRaw = (row as { quantityInitial?: unknown }).quantityInitial;
    const quantityInitial =
      typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
    const isHot = (row as { isHot?: unknown }).isHot === true;
    const sortOrder =
      typeof (row as { sortOrder?: unknown }).sortOrder === "number" && Number.isFinite((row as { sortOrder: number }).sortOrder)
        ? Math.floor((row as { sortOrder: number }).sortOrder)
        : i;
    const imageUrl =
      typeof (row as { imageUrl?: unknown }).imageUrl === "string" ? (row as { imageUrl: string }).imageUrl.trim().slice(0, 2000) : "";
    const color =
      typeof (row as { color?: unknown }).color === "string" ? (row as { color: string }).color.trim().slice(0, 32) : "";
    out.push({ label, priceUsd, quantityInitial, isHot, sortOrder, imageUrl, color });
  }
  return out.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function isVariantSalesFormat(format: string | null | undefined): boolean {
  return format === "variant_selection" || format === "team_break";
}

export type VariantSpotSummary = {
  available: number;
  sold: number;
  spotCount: number;
  fromPriceUsd: number | null;
};

type VariantSpotRow = {
  soldCount?: number;
  quantityRemaining: number;
  status: string;
  priceUsd?: number;
};

export function summarizeVariantSpots(variants: VariantSpotRow[] | undefined | null): VariantSpotSummary {
  if (!variants?.length) {
    return { available: 0, sold: 0, spotCount: 0, fromPriceUsd: null };
  }
  let available = 0;
  let sold = 0;
  const prices: number[] = [];
  for (const v of variants) {
    sold += Math.max(0, v.soldCount ?? 0);
    const soldOut = v.quantityRemaining <= 0 || v.status === "sold_out";
    if (!soldOut) {
      available += v.quantityRemaining;
      if (Number.isFinite(v.priceUsd)) prices.push(v.priceUsd!);
    }
  }
  return {
    available,
    sold,
    spotCount: variants.length,
    fromPriceUsd: prices.length ? Math.min(...prices) : null,
  };
}

export function isVariantPurchaseItem(
  item: { salesFormat?: string | null; variants?: unknown[] } | null | undefined,
): boolean {
  return Boolean(item && isVariantSalesFormat(item.salesFormat) && (item.variants?.length ?? 0) > 0);
}

/** True when every variant row is sold out (team break ready). */
export function allVariantSpotsSold(variants: VariantSpotRow[] | undefined | null): boolean {
  if (!variants?.length) return false;
  return variants.every((v) => v.quantityRemaining <= 0 || v.status === "sold_out");
}

export function variantBuyerSelectLabel(format: string | null | undefined): string {
  if (format === "team_break") return "Pick Your Division";
  if (format === "variant_selection") return "Pick Your Team";
  return "Select Spot";
}

export function variantHostSpotsLabel(opts: {
  roomLive: boolean;
  available: number;
  breakReady: boolean;
  breakBegan: boolean;
}): string {
  if (opts.breakBegan) return "Break Live";
  if (opts.breakReady) return "Break Ready";
  if (!opts.roomLive) return "Go Live for Spots";
  if (opts.available > 0) return "Spots Live";
  return "All Spots Sold";
}
