/** Buyer-side IVS playback helpers — mirrors web/src/lib/live-stream-playback.ts */

export type BuyerSafeStreamFields = {
  playbackUrl: string | null;
  streamHealth: string;
  streamPaused: boolean;
  streamStartedAt: string | null;
  streamEndedAt: string | null;
  lastStatusSyncAt: string | null;
  /** Delivery mode: "stage_webrtc" (sub-second WebRTC) or "channel_hls" (HLS/OBS path). */
  streamMode: string;
  /** Whether a Real-Time Stage exists for this room (gates WebRTC subscribe). */
  stageAvailable: boolean;
};

export type LivePlaybackSurfaceState =
  | 'loading'
  | 'connecting'
  | 'live'
  | 'offline'
  | 'reconnecting'
  | 'error';

/** Active delivery transport surfaced in the player (and dev debug overlay). */
export type LivePlaybackTransport = 'none' | 'waiting' | 'webrtc' | 'hls';

export function parseBuyerSafeStreamPayload(data: unknown): BuyerSafeStreamFields | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const stream = root.stream;
  if (!stream || typeof stream !== 'object') return null;
  const s = stream as Record<string, unknown>;
  const playbackUrl =
    typeof s.playbackUrl === 'string' && s.playbackUrl.trim().length > 0 ? s.playbackUrl.trim() : null;
  const streamHealth =
    typeof s.streamHealth === 'string' && s.streamHealth.trim() ? s.streamHealth.trim() : 'offline';
  const streamPaused = s.streamPaused === true;
  const streamStartedAt = typeof s.streamStartedAt === 'string' ? s.streamStartedAt : null;
  const streamEndedAt = typeof s.streamEndedAt === 'string' ? s.streamEndedAt : null;
  const lastStatusSyncAt = typeof s.lastStatusSyncAt === 'string' ? s.lastStatusSyncAt : null;
  const streamMode = typeof s.streamMode === 'string' && s.streamMode.trim() ? s.streamMode.trim() : 'channel_hls';
  const stageAvailable = s.stageAvailable === true;
  return {
    playbackUrl,
    streamHealth,
    streamPaused,
    streamStartedAt,
    streamEndedAt,
    lastStatusSyncAt,
    streamMode,
    stageAvailable,
  };
}

export function shouldAttachHlsPlayback(streamHealth: string, playbackUrl: string | null): boolean {
  if (!playbackUrl?.trim()) return false;
  const h = streamHealth.toLowerCase();
  return h === 'live' || h === 'connecting';
}

/** True when the stream signal is live-ish (WebRTC has no playbackUrl). */
export function isLiveStreamSignal(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === 'live' || h === 'connecting';
}

/** Client kill-switch — set EXPO_PUBLIC_LIVE_STAGE_ENABLED="false" to force HLS everywhere. */
export function isStageWebrtcEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LIVE_STAGE_ENABLED !== 'false';
}

/**
 * Hybrid transport kill-switch. When on (default), the buyer feed shows the pre-buffered HLS
 * mirror instantly on the active show and neighbors, then upgrades the settled show to sub-second
 * WebRTC after a short dwell. Set EXPO_PUBLIC_LIVE_HYBRID_ENABLED="false" to fall back to the
 * previous WebRTC-first behavior (active page joins the Stage immediately; neighbors buffer nothing)
 * without shipping a code revert.
 */
export function isHybridLiveEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LIVE_HYBRID_ENABLED !== 'false';
}

/** Dwell on a show before the settled page upgrades from instant HLS preview to sub-second WebRTC. */
export const WEBRTC_UPGRADE_DWELL_MS = 1_500;

/** How many neighbor shows (each side) pre-buffer their HLS mirror for instant switching. */
export const WARM_NEIGHBOR_RADIUS = 2;

export type ActiveTransportPlan =
  | { transport: 'webrtc'; armUpgrade: false }
  | { transport: 'hls'; armUpgrade: true }
  | { transport: 'hls'; armUpgrade: false }
  | { transport: 'waiting'; armUpgrade: false }
  | { transport: 'none'; armUpgrade: false };

/**
 * Decide the transport for a single playback surface (one show/page).
 *
 * Hybrid model:
 * - Active + WebRTC-eligible: preview HLS instantly and arm the dwell upgrade — unless already
 *   upgraded this visit, hybrid is off, or there is no HLS mirror to preview (then go straight to
 *   WebRTC, matching the legacy behavior).
 * - Neighbor (prefetch) + WebRTC-eligible: buffer the HLS mirror when hybrid is on (so switching to
 *   it is instant); otherwise stay 'waiting' (no media) like before. Neighbors never join WebRTC —
 *   the IVS Real-Time Stage SDK is a process-wide singleton, so only the settled show subscribes.
 * - Not WebRTC-eligible (channel_hls, guest, failed-over, offline): attach HLS when available.
 */
export function resolveSurfaceTransportPlan(input: {
  stream: Pick<BuyerSafeStreamFields, 'streamMode' | 'stageAvailable' | 'streamHealth' | 'playbackUrl'>;
  isActive: boolean;
  webrtcFailed: boolean;
  accessToken?: string;
  hybridEnabled: boolean;
  alreadyUpgraded: boolean;
}): ActiveTransportPlan {
  const eligible = shouldUseStageWebrtcPlayback(input.stream, input.webrtcFailed, input.accessToken);
  const hlsAttachable = shouldAttachHlsPlayback(input.stream.streamHealth, input.stream.playbackUrl);

  if (input.isActive && eligible) {
    if (input.hybridEnabled && hlsAttachable && !input.alreadyUpgraded) {
      return { transport: 'hls', armUpgrade: true };
    }
    return { transport: 'webrtc', armUpgrade: false };
  }

  if (!input.isActive && eligible) {
    if (input.hybridEnabled && hlsAttachable) {
      return { transport: 'hls', armUpgrade: false };
    }
    return { transport: 'waiting', armUpgrade: false };
  }

  if (hlsAttachable) return { transport: 'hls', armUpgrade: false };
  return { transport: isLiveStreamSignal(input.stream.streamHealth) ? 'waiting' : 'none', armUpgrade: false };
}

/** Stage sellers publish WebRTC — buyers subscribe to the same Stage for sub-second video; HLS is failover for guests/OBS. */
export function preferHlsOverWebrtcOnClient(): boolean {
  return false;
}

/** Whether the buyer should attempt IVS Real-Time Stage subscribe (before one-shot HLS failover). */
export function shouldUseStageWebrtcPlayback(
  stream: Pick<BuyerSafeStreamFields, 'streamMode' | 'stageAvailable' | 'streamHealth'>,
  webrtcFailed: boolean,
  accessToken?: string,
): boolean {
  return (
    Boolean(accessToken?.trim()) &&
    isStageWebrtcEnabled() &&
    !preferHlsOverWebrtcOnClient() &&
    stream.streamMode === 'stage_webrtc' &&
    stream.stageAvailable &&
    !webrtcFailed &&
    isLiveStreamSignal(stream.streamHealth)
  );
}

export function isOfflineLikeStreamHealth(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === 'offline' || h === 'not_provisioned' || h === 'ended';
}

export function resolveLivePlaybackSurfaceState(input: {
  loading: boolean;
  fetchFailed: boolean;
  reconnecting: boolean;
  streamHealth: string;
  playbackUrl: string | null;
  videoHasRenderableData: boolean;
  playerFatal: boolean;
  roomLifecycleLive?: boolean;
}): LivePlaybackSurfaceState {
  const roomLive = input.roomLifecycleLive ?? true;
  if (input.fetchFailed && roomLive) return 'error';
  if (input.fetchFailed && !roomLive) return 'offline';
  if (input.videoHasRenderableData) return 'live';
  if (input.reconnecting) return 'reconnecting';
  if (input.loading && !input.playbackUrl) return 'loading';
  if (!input.playbackUrl?.trim()) return 'offline';
  if (input.streamHealth.toLowerCase() === 'error') return roomLive ? 'error' : 'offline';
  if (input.playerFatal && roomLive) return 'error';
  if (input.playerFatal && !roomLive) return 'offline';
  if (isOfflineLikeStreamHealth(input.streamHealth)) return 'offline';
  if (shouldAttachHlsPlayback(input.streamHealth, input.playbackUrl)) {
    return input.videoHasRenderableData ? 'live' : 'connecting';
  }
  return 'offline';
}

export const STREAM_POLL_MS = 2_500;
export const MAX_PLAYER_RETRIES = 5;
export const PLAYER_BACKOFF_BASE_MS = 900;
