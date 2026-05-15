/**
 * Estimate client clock skew vs server using one round-trip sample.
 * Positive skew means client wall clock is behind server (client needs to add skew to match server).
 *
 * Room realtime payloads include `serverNowMs` (emit time) so live timers can resync on each
 * `bid_placed` / `active_item_changed` / `auction_started` without waiting on GET `/api/time`.
 */
export function estimateClockSkewMs(clientStartMs: number, clientEndMs: number, serverNowMs: number): number {
  const midpoint = (clientStartMs + clientEndMs) / 2;
  return serverNowMs - midpoint;
}

/** Apply skew so comparisons align with server decision time (auction end, etc.). */
export function syncedWallTimeMs(clockSkewMs: number): number {
  return Date.now() + clockSkewMs;
}
