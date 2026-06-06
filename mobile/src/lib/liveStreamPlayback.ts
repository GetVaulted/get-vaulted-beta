/** Buyer-side IVS playback helpers — mirrors web/src/lib/live-stream-playback.ts */

export type BuyerSafeStreamFields = {
  playbackUrl: string | null;
  streamHealth: string;
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
  const streamStartedAt = typeof s.streamStartedAt === 'string' ? s.streamStartedAt : null;
  const streamEndedAt = typeof s.streamEndedAt === 'string' ? s.streamEndedAt : null;
  const lastStatusSyncAt = typeof s.lastStatusSyncAt === 'string' ? s.lastStatusSyncAt : null;
  const streamMode = typeof s.streamMode === 'string' && s.streamMode.trim() ? s.streamMode.trim() : 'channel_hls';
  const stageAvailable = s.stageAvailable === true;
  return {
    playbackUrl,
    streamHealth,
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

/** Prefer IVS Real-Time Stage WebRTC when available; HLS is the failover path. */
export function preferHlsOverWebrtcOnClient(): boolean {
  return false;
}

/** Whether the buyer should attempt IVS Real-Time Stage subscribe (before one-shot HLS failover). */
export function shouldUseStageWebrtcPlayback(
  stream: Pick<BuyerSafeStreamFields, 'streamMode' | 'stageAvailable' | 'streamHealth'>,
  webrtcFailed: boolean,
): boolean {
  return (
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

export const STREAM_POLL_MS = 5_000;
export const MAX_PLAYER_RETRIES = 5;
export const PLAYER_BACKOFF_BASE_MS = 900;
