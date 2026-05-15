/** Set `LIVE_AUCTION_RT_DEBUG=1` to log bid → persist → emit → client paths (verbose). */
export function logLiveAuctionRtDebug(...args: unknown[]): void {
  if (process.env.LIVE_AUCTION_RT_DEBUG !== "1") return;
  console.info("[live-auction-rt]", ...args);
}
