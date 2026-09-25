import type { VariantDraftInput } from "@/lib/live-item-variant-presets";

/** Abbr / color key for the optional NFL PYT NCAA buyable spot. */
export const NCAA_SPOT_ABBR = "NCAA";
export const NCAA_SPOT_LABEL = "NCAA";

export function isNcaaSpotVariant(v: { label?: string | null; color?: string | null }): boolean {
  const color = (v.color ?? "").trim().toUpperCase();
  if (color === NCAA_SPOT_ABBR) return true;
  return (v.label ?? "").trim().toUpperCase() === NCAA_SPOT_LABEL;
}

export function stripNcaaSpotVariants<T extends { label?: string | null; color?: string | null }>(
  variants: T[],
): T[] {
  return variants.filter((v) => !isNcaaSpotVariant(v));
}

/** Append a buyable NCAA spot (or refresh its price) for NFL PYT pick boards. */
export function withNcaaBuyableSpot(
  variants: VariantDraftInput[],
  priceUsd: number,
): VariantDraftInput[] {
  const base = stripNcaaSpotVariants(variants);
  return [
    ...base,
    {
      label: NCAA_SPOT_LABEL,
      priceUsd,
      quantityInitial: 1,
      sortOrder: base.length,
      color: NCAA_SPOT_ABBR,
    },
  ];
}

/** Bump random-team pool size by one when NCAA is included. */
export function withNcaaRandomPoolSeat(
  variants: VariantDraftInput[],
  baseTeamCount: number,
): VariantDraftInput[] {
  if (variants.length === 0) return variants;
  return variants.map((v, i) =>
    i === 0
      ? {
          ...v,
          quantityInitial: baseTeamCount + 1,
        }
      : v,
  );
}
