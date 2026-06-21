/**
 * HTTP reconcile intervals when Supabase realtime is primary.
 * Tighter only when realtime is unavailable — reduces Netlify function load during live shows.
 */

/** Full room snapshot GET /api/live-rooms/:id */
export function liveRoomReconcilePollMs(opts: {
  hasRealtime: boolean;
  wantsTightPoll: boolean;
}): number {
  if (opts.wantsTightPoll) {
    return opts.hasRealtime ? 12_000 : 3_000;
  }
  return opts.hasRealtime ? 30_000 : 8_000;
}

/** Chat merge GET /api/live-rooms/:id/messages */
export function liveChatFallbackPollMs(hasRealtime: boolean): number {
  return hasRealtime ? 5_000 : 2_000;
}

/** Buyer bid labels GET /api/listings/:id/bids */
export function liveBidMetaFallbackPollMs(hasRealtime: boolean): number {
  return hasRealtime ? 2_500 : 850;
}
