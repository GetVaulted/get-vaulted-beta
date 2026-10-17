/** Optional NCAA buyable spot helpers for NFL PYT (mirrors web nfl-ncaa-spot). */

import type { LiveBreakVariantDraft } from './liveBreakPresets';
import { boardPackTeamCount, type LiveBoardPackId } from './liveBoardPacks';

export const NCAA_SPOT_ABBR = 'NCAA';
export const NCAA_SPOT_LABEL = 'NCAA';

export function isNcaaSpotVariant(v: { label?: string | null; color?: string | null }): boolean {
  const color = (v.color ?? '').trim().toUpperCase();
  if (color === NCAA_SPOT_ABBR) return true;
  return (v.label ?? '').trim().toUpperCase() === NCAA_SPOT_LABEL;
}

export function stripNcaaSpotVariants<T extends { label?: string | null; color?: string | null }>(
  variants: T[],
): T[] {
  return variants.filter((v) => !isNcaaSpotVariant(v));
}

export function withNcaaBuyableSpot(
  variants: LiveBreakVariantDraft[],
  priceUsd: number,
): LiveBreakVariantDraft[] {
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

export function withNcaaRandomPoolSeat(
  variants: LiveBreakVariantDraft[],
  boardPack: LiveBoardPackId = 'nfl',
): LiveBreakVariantDraft[] {
  if (variants.length === 0) return variants;
  const baseCount = boardPackTeamCount(boardPack);
  return variants.map((v, i) =>
    i === 0
      ? {
          ...v,
          quantityInitial: baseCount + 1,
        }
      : v,
  );
}

/** Extra "other league" buyable spots for NFL PYT (MLB / NBA / NHL), alongside NCAA. */
export const LEAGUE_EXTRA_SPOT_KEYS = ['MLB', 'NBA', 'NHL'] as const;
export type LeagueExtraSpotKey = (typeof LEAGUE_EXTRA_SPOT_KEYS)[number];

export function isLeagueExtraSpotVariant(v: { label?: string | null; color?: string | null }): boolean {
  const color = (v.color ?? '').trim().toUpperCase();
  const label = (v.label ?? '').trim().toUpperCase();
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
  variants: LiveBreakVariantDraft[],
  extras: readonly LeagueExtraSpotKey[],
  priceUsd: number,
): LiveBreakVariantDraft[] {
  const base = stripLeagueExtraSpotVariants(variants);
  const picked = LEAGUE_EXTRA_SPOT_KEYS.filter((k) => extras.includes(k));
  return [
    ...base,
    ...picked.map((k, i) => ({
      label: k,
      priceUsd,
      quantityInitial: 1,
      sortOrder: base.length + i,
      color: k as string,
    })),
  ];
}

/** Random-team pool = core teams + every optional extra seat (NCAA, MLB, NBA, NHL). */
export function withRandomPoolExtraSeats(
  variants: LiveBreakVariantDraft[],
  boardPack: LiveBoardPackId,
  extraSeats: number,
): LiveBreakVariantDraft[] {
  if (variants.length === 0 || extraSeats <= 0) return variants;
  const baseCount = boardPackTeamCount(boardPack);
  return variants.map((v, i) => (i === 0 ? { ...v, quantityInitial: baseCount + extraSeats } : v));
}
