/**
 * Sweet 16 Break sales progress (pure). The board lists 32 NFL teams but only SWEET16_MAX_SPOTS
 * may be sold; once the cap is hit (server sets `variantBreakReadyAt`) sales stop and the
 * remaining unsold tiles read as "Closed" instead of buyable.
 */
import { SWEET16_MAX_SPOTS, liveBreakVariantIsSold } from './liveBreakPresets';

type SweetVariantLike = {
  quantityRemaining?: number | null;
  status?: string | null;
};

export function isSweet16DraftMode(mode: string | null | undefined): boolean {
  return mode === 'draft';
}

/** Teams that have been bought (removed rows never count). */
export function sweet16SoldCount(variants: readonly SweetVariantLike[] | null | undefined): number {
  return (variants ?? []).filter((v) => liveBreakVariantIsSold(v)).length;
}

export type Sweet16SalesProgress = {
  sold: number;
  max: number;
  /** Sales have stopped: the server marked the break ready, or the cap is already reached. */
  closed: boolean;
  /** "N of 16 sold" while open. */
  progressLabel: string;
  /** "Sales closed — 16 teams sold" once closed. */
  closedLabel: string;
  /** Whichever of the two applies right now. */
  statusLabel: string;
};

export function sweet16SalesProgress(args: {
  variants: readonly SweetVariantLike[] | null | undefined;
  breakReadyAt?: string | null;
  maxSpots?: number;
}): Sweet16SalesProgress {
  const max = args.maxSpots ?? SWEET16_MAX_SPOTS;
  const sold = Math.min(sweet16SoldCount(args.variants), max);
  const closed = Boolean(args.breakReadyAt) || sold >= max;
  const progressLabel = `${sold} of ${max} sold`;
  const closedLabel = `Sales closed — ${max} teams sold`;
  return { sold, max, closed, progressLabel, closedLabel, statusLabel: closed ? closedLabel : progressLabel };
}

export type Sweet16TileState = 'open' | 'sold' | 'unavailable' | 'closed';

/** How a single board tile should read: buyable only while sales are open and the team is unsold. */
export function sweet16TileState(variant: SweetVariantLike, salesClosed: boolean): Sweet16TileState {
  if (variant.status === 'removed') return 'unavailable';
  if (liveBreakVariantIsSold(variant)) return 'sold';
  return salesClosed ? 'closed' : 'open';
}
