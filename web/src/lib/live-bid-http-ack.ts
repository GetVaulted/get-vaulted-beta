/**
 * Lean bid HTTP ACK item — enough for clients to advance high bid / timer without a
 * second full-row snapshot round-trip after the accept transaction.
 */
export type LiveBidAckItem = {
  id: string;
  itemVersion: number;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  lastHighBidderId: string | null;
  lastHighBidderUsername: string | null;
  biddingOpen: boolean;
  auctionEndsAt: string | null;
  clutchTimeEnabled: boolean;
};

export function buildLiveBidAckItem(args: {
  itemId: string;
  itemVersion: number;
  currentBidUsd: number | null;
  startingBidUsd?: number | null;
  lastHighBidderId: string | null;
  lastHighBidderUsername: string | null;
  biddingOpen?: boolean;
  auctionEndsAt: string | null;
  clutchTimeEnabled?: boolean;
}): LiveBidAckItem {
  return {
    id: args.itemId,
    itemVersion: Math.max(0, Math.floor(args.itemVersion)),
    currentBidUsd: args.currentBidUsd,
    startingBidUsd: args.startingBidUsd ?? null,
    lastHighBidderId: args.lastHighBidderId,
    lastHighBidderUsername: args.lastHighBidderUsername,
    biddingOpen: args.biddingOpen !== false,
    auctionEndsAt: args.auctionEndsAt,
    clutchTimeEnabled: args.clutchTimeEnabled === true,
  };
}
