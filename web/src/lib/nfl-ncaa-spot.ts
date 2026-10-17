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

/** Random-team pool = core teams + every optional extra seat (NCAA, MLB, NBA, NHL). */
export function withRandomPoolExtraSeats(
  variants: VariantDraftInput[],
  baseTeamCount: number,
  extraSeats: number,
): VariantDraftInput[] {
  if (variants.length === 0 || extraSeats <= 0) return variants;
  return variants.map((v, i) => (i === 0 ? { ...v, quantityInitial: baseTeamCount + extraSeats } : v));
}

/** Extra "other league" buyable spots for NFL PYT (MLB / NBA / NHL), alongside NCAA. */
export const LEAGUE_EXTRA_SPOT_KEYS = ["MLB", "NBA", "NHL"] as const;
export type LeagueExtraSpotKey = (typeof LEAGUE_EXTRA_SPOT_KEYS)[number];

export function isLeagueExtraSpotVariant(v: { label?: string | null; color?: string | null }): boolean {
  const color = (v.color ?? "").trim().toUpperCase();
  const label = (v.label ?? "").trim().toUpperCase();
  return (
    (LEAGUE_EXTRA_SPOT_KEYS as readonly string[]).includes(color) ||
    (LEAGUE_EXTRA_SPOT_KEYS as readonly string[]).includes(label)
  );
}

export function stripLeagueExtraSpotVariants<T extends { label?: string | null; color?: string | null }>(
  variants: T[],
): T[] {
  return variants.filter((v) => !isLeagueExtraSpotVariant(v));
}

/** Append one buyable spot per selected extra league (replaces any existing extras). */
export function withLeagueExtraBuyableSpots(
  variants: VariantDraftInput[],
  extras: readonly LeagueExtraSpotKey[],
  priceUsd: number,
): VariantDraftInput[] {
  const base = stripLeagueExtraSpotVariants(variants);
  const picked = LEAGUE_EXTRA_SPOT_KEYS.filter((k) => extras.includes(k));
  return [
    ...base,
    ...picked.map((k, i) => ({
      label: k,
      priceUsd,
      quantityInitial: 1,
      sortOrder: base.length + i,
      color: k,
    })),
  ];
}
