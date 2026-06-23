/**
 * Buyer-side IVS playback helpers. Only consume fields returned by GET /api/live-rooms/[id]/stream for buyers.
 */

export type BuyerSafeStreamFields = {
  playbackUrl: string | null;
  streamHealth: string;
  streamPaused: boolean;
  streamStartedAt: string | null;
  streamEndedAt: string | null;
  lastStatusSyncAt: string | null;
  /** Configured IVS channel latency mode ("LOW" = low-latency HLS). */
  latencyMode: string | null;
  /** Delivery mode: "stage_webrtc" (sub-second WebRTC) or "channel_hls" (HLS/OBS path). */
  streamMode: string;
  /** Whether a Real-Time Stage exists (gates the WebRTC subscribe attempt). */
  stageAvailable: boolean;
};

/** UI states surfaced on the live video stage (not IVS SDK states). */
export type LivePlaybackSurfaceState =
  | "loading"
  | "connecting"
  | "live"
  | "offline"
  | "reconnecting"
  | "error";

export function parseBuyerSafeStreamPayload(data: unknown): BuyerSafeStreamFields | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const stream = root.stream;
  if (!stream || typeof stream !== "object") return null;
  const s = stream as Record<string, unknown>;
  const playbackUrl = typeof s.playbackUrl === "string" && s.playbackUrl.trim().length > 0 ? s.playbackUrl.trim() : null;
  const streamHealth = typeof s.streamHealth === "string" && s.streamHealth.trim() ? s.streamHealth.trim() : "offline";
  const streamPaused = s.streamPaused === true;
  const streamStartedAt = typeof s.streamStartedAt === "string" ? s.streamStartedAt : null;
  const streamEndedAt = typeof s.streamEndedAt === "string" ? s.streamEndedAt : null;
  const lastStatusSyncAt = typeof s.lastStatusSyncAt === "string" ? s.lastStatusSyncAt : null;
  const latencyMode = typeof s.latencyMode === "string" && s.latencyMode.trim() ? s.latencyMode.trim() : null;
  const streamMode = typeof s.streamMode === "string" && s.streamMode.trim() ? s.streamMode.trim() : "channel_hls";
  const stageAvailable = s.stageAvailable === true;
  return {
    playbackUrl,
    streamHealth,
    streamPaused,
    streamStartedAt,
    streamEndedAt,
    lastStatusSyncAt,
    latencyMode,
    streamMode,
    stageAvailable,
  };
}

/** True on iOS Safari / iPadOS — used for transport and `<video>` HLS attach decisions. */
export function isIosLikePlaybackClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Buyers watch IVS Low-Latency HLS — reliable for multi-hour shows. Host still publishes via WebRTC Stage. */
export function preferHlsOverWebrtcOnClient(): boolean {
  return true;
}

/** iOS must use native `<video src="*.m3u8">` — hls.js MSE path stalls or shows a blank frame. */
export function preferNativeHlsElementPlayback(): boolean {
  return isIosLikePlaybackClient();
}

export function isLiveStreamSignal(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === "live" || h === "connecting";
}

export function shouldAttachHlsPlayback(streamHealth: string, playbackUrl: string | null): boolean {
  if (!playbackUrl?.trim()) return false;
  const h = streamHealth.toLowerCase();
  return h === "live" || h === "connecting";
}

export function isOfflineLikeStreamHealth(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === "offline" || h === "not_provisioned" || h === "ended";
}

export function resolveLivePlaybackSurfaceState(input: {
  loading: boolean;
  fetchFailed: boolean;
  reconnecting: boolean;
  streamHealth: string;
  playbackUrl: string | null;
  videoHasRenderableData: boolean;
  playerFatal: boolean;
  /** When false (scheduled / not go-live yet), stream fetch failures are not surfaced as playback `error`. */
  roomLifecycleLive?: boolean;
}): LivePlaybackSurfaceState {
  const roomLive = input.roomLifecycleLive ?? true;
  if (input.fetchFailed && roomLive) return "error";
  if (input.fetchFailed && !roomLive) return "offline";
  if (input.reconnecting) return "reconnecting";
  if (input.loading && !input.playbackUrl) return "loading";
  if (!input.playbackUrl?.trim()) return "offline";
  if (input.streamHealth.toLowerCase() === "error") return roomLive ? "error" : "offline";
  if (input.playerFatal && roomLive) return "error";
  if (input.playerFatal && !roomLive) return "offline";
  if (isOfflineLikeStreamHealth(input.streamHealth)) return "offline";
  if (shouldAttachHlsPlayback(input.streamHealth, input.playbackUrl)) {
    return input.videoHasRenderableData ? "live" : "connecting";
  }
  return "offline";
}
