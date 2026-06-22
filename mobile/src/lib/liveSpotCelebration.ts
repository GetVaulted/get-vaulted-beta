/** On-screen announcement when a PYT spot is purchased or won at auction. */

export type LiveSpotTakenCelebration = {
  username: string;
  label: string;
  amountUsd: number;
  kind: 'purchase' | 'auction_win';
};

export function parseVariantPurchasedCelebration(payload: {
  label?: string | null;
  buyerUsername?: string | null;
  amountUsd?: number | null;
  randomReveal?: boolean;
}): LiveSpotTakenCelebration | null {
  if (payload.randomReveal) return null;
  const label = payload.label?.trim();
  const username = payload.buyerUsername?.trim()?.replace(/^@+/, '');
  if (!label || !username) return null;
  const amountUsd =
    typeof payload.amountUsd === 'number' && Number.isFinite(payload.amountUsd) ? payload.amountUsd : 0;
  return { username, label, amountUsd, kind: 'purchase' };
}

export function parseAuctionWinSpotCelebration(payload: {
  winnerUsername?: string | null;
  winningAmountUsd?: number | null;
  itemTitle?: string | null;
  noBids?: boolean;
}): LiveSpotTakenCelebration | null {
  if (payload.noBids) return null;
  const username = payload.winnerUsername?.trim()?.replace(/^@+/, '');
  if (!username) return null;
  const amountUsd =
    typeof payload.winningAmountUsd === 'number' && Number.isFinite(payload.winningAmountUsd)
      ? payload.winningAmountUsd
      : 0;
  const label = payload.itemTitle?.trim() || 'Spot';
  return { username, label, amountUsd, kind: 'auction_win' };
}

export function spotCelebrationHeadline(kind: LiveSpotTakenCelebration['kind']): string {
  return kind === 'auction_win' ? 'SOLD!' : 'TAKEN!';
}

/** Stable key for dismiss timers — avoids resetting when parent re-renders. */
export function spotCelebrationDismissKey(c: LiveSpotTakenCelebration): string {
  return `${c.kind}|${c.username}|${c.label}|${c.amountUsd}`;
}

export const SPOT_CELEBRATION_DISPLAY_MS = 4000;
