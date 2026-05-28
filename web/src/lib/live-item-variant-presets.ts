/** Preset labels for fast variant / spot setup in live queue items. */

export type LiveItemVariantPresetId = "nfl_divisions" | "custom";

export type LiveItemVariantPresetOption = {
  label: string;
  sortOrder: number;
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

export const LIVE_ITEM_VARIANT_PRESETS: Record<
  Exclude<LiveItemVariantPresetId, "custom">,
  { label: string; options: LiveItemVariantPresetOption[] }
> = {
  nfl_divisions: {
    label: "NFL Divisions",
    options: NFL_DIVISIONS_PRESET,
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
