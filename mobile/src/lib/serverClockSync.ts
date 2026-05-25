/** Estimate client clock skew vs server (positive = client is behind). */
export function estimateClockSkewMs(clientStartMs: number, clientEndMs: number, serverNowMs: number): number {
  const midpoint = (clientStartMs + clientEndMs) / 2;
  return serverNowMs - midpoint;
}

export function syncedWallTimeMs(clockSkewMs: number): number {
  return Date.now() + clockSkewMs;
}
