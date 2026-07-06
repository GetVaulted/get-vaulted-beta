/**
 * Determines who should receive a single "you've been outbid" notification after a
 * host-only live-lot bid finishes resolving (including any automatic proxy-bid chain it
 * triggers within the same request).
 *
 * A single incoming bid can cascade through several proxy-bid resolutions before settling
 * (see `resolveLiveProxyBidChain`), each of which briefly displaces a different bidder.
 * Notifying every intermediate displaced bidder floods users with redundant messages for
 * what is, from their perspective, one event. Instead — mirroring the marketplace
 * `/api/bids` route, which only ever notifies the single `prevLeaderId` — we notify only
 * the bidder who was displaced by the *final* settled outcome of this bid-processing cycle.
 */
export function resolveFinalDisplacedBidder(args: {
  /** The lot's leading bidder immediately before this bid-processing cycle began, if any. */
  prevLeaderId: string | null;
  /** The user who submitted the new bid that kicked off this cycle. */
  bidderId: string;
  /** Ordered proxy-outbid events produced while resolving the chain, oldest first. */
  proxyOutbids: Array<{ userId: string; amountUsd: number }>;
  /** The lot's actual current high bid once the whole cycle has settled. */
  finalHighUsd: number;
}): { userId: string; amountUsd: number } | null {
  const lastProxyOutbid = args.proxyOutbids[args.proxyOutbids.length - 1];
  if (lastProxyOutbid) {
    return { userId: lastProxyOutbid.userId, amountUsd: args.finalHighUsd };
  }
  if (args.prevLeaderId && args.prevLeaderId !== args.bidderId) {
    return { userId: args.prevLeaderId, amountUsd: args.finalHighUsd };
  }
  return null;
}
