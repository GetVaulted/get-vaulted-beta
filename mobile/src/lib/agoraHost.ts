/** Pure helpers for the Agora host publisher (kept free of native imports so they unit-test). */

/** Portrait 720p at 30 fps — the phone is always a portrait camera and Media Push forwards it as-is. */
export const AGORA_HOST_VIDEO = { width: 720, height: 1280, frameRate: 30, bitrateKbps: 2500 } as const;

/** Zoom steps the host UI offers: 1x plus whole-number stops the camera can actually reach. */
export function agoraZoomStops(maxZoom: number, supported: boolean): number[] {
  if (!supported || !Number.isFinite(maxZoom) || maxZoom < 2) return [1];
  return [1, 2, 3, 5].filter((z) => z <= maxZoom);
}

export function clampAgoraZoom(factor: number, maxZoom: number): number {
  if (!Number.isFinite(factor)) return 1;
  const max = Number.isFinite(maxZoom) && maxZoom >= 1 ? maxZoom : 1;
  return Math.min(Math.max(factor, 1), max);
}

/** Delay before the nth retry (1-based) of the relay start call: 1.5 s, 3 s, 4.5 s. */
export function relayRetryDelayMs(attempt: number): number {
  return 1_500 * Math.max(1, attempt);
}

/** Refresh the Agora token this long before it lapses (never sooner than a minute from now). */
export function agoraTokenRefreshDelayMs(expiresInSeconds: number): number {
  const leadMs = 60 * 60 * 1000;
  if (expiresInSeconds > 0) return Math.max(60_000, expiresInSeconds * 1000 - leadMs);
  return 11 * 60 * 60 * 1000;
}

export function friendlyAgoraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|denied|not allowed/i.test(msg)) {
    return 'Camera and microphone access is required to preview and go live. Enable both in Settings, then tap Retry.';
  }
  if (msg.trim()) return msg.trim();
  return 'Could not start the live broadcast.';
}
