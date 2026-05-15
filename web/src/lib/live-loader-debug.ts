/**
 * Opt-in diagnostics for live room / host console loaders (`GET /api/live-rooms/...`, RSC pages).
 * Set `LIVE_CONSOLE_LOADER_DEBUG=1` in `.env.local` (server-side only).
 */
export function logLiveLoaderDebug(scope: string, data: Record<string, unknown>): void {
  if (process.env.LIVE_CONSOLE_LOADER_DEBUG !== "1") return;
  console.info("[live-console-loader]", scope, data);
}

/** Decode a single dynamic route segment; leaves value unchanged if URI is malformed. */
export function safeDecodeRouteSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
