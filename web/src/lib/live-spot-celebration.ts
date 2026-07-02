/** On-screen announcement when a PYT spot is purchased or won at auction. */

export type LiveSpotTakenCelebration = {
  username: string;
  label: string;
  amountUsd: number;
  kind: "purchase" | "auction_win";
};

export function parseVariantPurchasedCelebration(payload: {
  label?: string | null;
  buyerUsername?: string | null;
  amountUsd?: number | null;
  randomReveal?: boolean;
}): LiveSpotTakenCelebration | null {
  const label = payload.label?.trim();
  const username = payload.buyerUsername?.trim()?.replace(/^@+/, "") || "Buyer";
  if (!label) return null;
  const amountUsd =
    typeof payload.amountUsd === "number" && Number.isFinite(payload.amountUsd) ? payload.amountUsd : 0;
  return { username, label, amountUsd, kind: "purchase" };
}

export function parseAuctionWinSpotCelebration(payload: {
  winnerUsername?: string | null;
  winningAmountUsd?: number | null;
  itemTitle?: string | null;
  noBids?: boolean;
}): LiveSpotTakenCelebration | null {
  if (payload.noBids) return null;
  const username = payload.winnerUsername?.trim()?.replace(/^@+/, "");
  if (!username) return null;
  const amountUsd =
    typeof payload.winningAmountUsd === "number" && Number.isFinite(payload.winningAmountUsd)
      ? payload.winningAmountUsd
      : 0;
  const label = payload.itemTitle?.trim() || "Spot";
  return { username, label, amountUsd, kind: "auction_win" };
}

export function normalizeSpotCelebrationUsername(username: string): string {
  return username.trim().replace(/^@+/, "");
}

export function isSpotCelebrationViewerWinner(
  celebration: LiveSpotTakenCelebration,
  viewerUsername?: string | null,
): boolean {
  const viewer = viewerUsername ? normalizeSpotCelebrationUsername(viewerUsername) : "";
  if (!viewer) return false;
  return normalizeSpotCelebrationUsername(celebration.username).toLowerCase() === viewer.toLowerCase();
}

export function spotCelebrationHeadline(
  kind: LiveSpotTakenCelebration["kind"],
  opts?: { viewerIsWinner?: boolean },
): string {
  if (opts?.viewerIsWinner) {
    return kind === "auction_win" ? "YOU WON!" : "YOU CLAIMED IT!";
  }
  return kind === "auction_win" ? "SOLD!" : "CLAIMED!";
}

export function spotCelebrationKicker(kind: LiveSpotTakenCelebration["kind"]): string {
  return kind === "auction_win" ? "Hammer dropped" : "Spot secured";
}

export function spotCelebrationTagline(kind: LiveSpotTakenCelebration["kind"]): string {
  return kind === "auction_win" ? "Locked in · shipping from wallet" : "In the Vault · Get Vaulted Live";
}

/** Full-screen spot celebration duration — matches Vault Reveal total display (~4s). */
export const SPOT_CELEBRATION_DISPLAY_MS = 4000;

/** Price is intentionally hidden on the buyer celebration popup. */
export function formatSpotCelebrationPrice(_amountUsd: number): string | null {
  return null;
}

export function formatSpotWinnerAnnouncement(celebration: LiveSpotTakenCelebration): string {
  return `@${celebration.username} won (${celebration.label})`;
}

export function formatSpotCelebrationAccessibility(
  celebration: LiveSpotTakenCelebration,
  opts?: { viewerIsWinner?: boolean },
): string {
  const headline = spotCelebrationHeadline(celebration.kind, opts);
  if (opts?.viewerIsWinner) {
    return `${headline} ${celebration.label}`;
  }
  return `${headline} @${celebration.username} claimed ${celebration.label}`;
}

/** Stable key for dismiss timers — avoids resetting when parent re-renders. */
export function spotCelebrationDismissKey(c: LiveSpotTakenCelebration): string {
  return `${c.kind}|${c.username}|${c.label}|${c.amountUsd}`;
}
