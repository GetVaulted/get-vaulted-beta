/** Shared copy for live auction leader / winner display (server-sourced usernames only). */

export function formatAuctionMoneyUsd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: amount % 1 === 0 ? 0 : 2 })}`;
}

export function formatAuctionLeaderLine(args: {
  lastHighBidderUsername?: string | null;
  lastHighBidderId?: string | null;
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
}): string {
  const handle = args.lastHighBidderUsername?.trim();
  const hasBidder = Boolean(handle || args.lastHighBidderId?.trim());
  if (handle) return `Winning: @${handle}`;
  if (hasBidder) return "High bid on the floor";
  const opening = args.startingBidUsd ?? args.priceUsd ?? 1;
  if (typeof opening === "number" && Number.isFinite(opening) && opening > 0) {
    return `Opening bid ${formatAuctionMoneyUsd(opening)}`;
  }
  return "No bids yet";
}

export type LiveAuctionCloseCelebration =
  | { kind: "sold"; winnerUsername: string; winningAmountUsd: number; itemId: string }
  | { kind: "no_bids"; itemId: string };

export function parsePurchaseCompletedCelebration(payload: {
  itemId?: string;
  winnerUsername?: string | null;
  winningAmountUsd?: number | null;
  noBids?: boolean;
}): LiveAuctionCloseCelebration | null {
  if (!payload.itemId?.trim()) return null;
  const itemId = payload.itemId.trim();
  if (payload.noBids) return { kind: "no_bids", itemId };
  const winnerUsername = payload.winnerUsername?.trim();
  if (winnerUsername && typeof payload.winningAmountUsd === "number" && Number.isFinite(payload.winningAmountUsd)) {
    return { kind: "sold", itemId, winnerUsername, winningAmountUsd: payload.winningAmountUsd };
  }
  return null;
}
