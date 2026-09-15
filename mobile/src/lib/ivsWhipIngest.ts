/**
 * AWS IVS Real-Time WHIP ingest (OBS 30+ → Stage WebRTC).
 * Keep in sync with web/src/lib/ivs-whip-ingest.ts.
 */
export const IVS_WHIP_SERVER_URL = 'https://global.whip.live-video.net';

/** True when the stored ingest endpoint is the IVS WHIP server (OBS WebRTC path). */
export function isIvsWhipIngestEndpoint(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return false;
  return v.includes('whip.live-video.net') || v === IVS_WHIP_SERVER_URL.toLowerCase();
}
