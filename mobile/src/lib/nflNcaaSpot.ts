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
