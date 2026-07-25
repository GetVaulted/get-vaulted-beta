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

/**
 * Explicit viewer playback state machine used to gate the "Waiting for host video" overlay and
 * the re-entry watchdog. Unlike `LivePlaybackTransport` (which only says which surface is
 * *attached*), this reflects whether a transport is actually *producing video*:
 * - `hls-loading` / `webrtc-joining`: attached but no first frame yet.
 * - `hls-playing` / `webrtc-video-ready`: real playable video is on screen.
 * The waiting overlay may ONLY stay up while neither `*-playing`/`*-video-ready` is reached and a
 * reconnect attempt is still active. Presence of a `playbackUrl` or a `connected` WebRTC socket is
 * never treated as proof of playable video.
 */
export type ViewerTransportState =
  | 'idle'
  | 'hls-loading'
  | 'hls-playing'
  | 'webrtc-joining'
  | 'webrtc-video-ready'
  | 'failed';

/** Re-entry watchdog: log that the first frame is slow. */
export const PLAYBACK_RECONNECT_SLOW_MS = 3_000;
/** Re-entry watchdog: abandon the current HLS attempt and force the WebRTC fallback surface. */
export const HLS_FIRST_FRAME_TIMEOUT_MS = 6_000;
/** Re-entry watchdog: neither transport produced video — keep auto-recovering (no Retry CTA). */
export const PLAYBACK_RECONNECT_FAILED_MS = 10_000;

/**
 * Soft signal: room looks live but no frames yet. Used for watchdog only —
 * must NOT drive the "Host paused" buyer UI (that stranded viewers on 143).
 */
export const HOST_AWAY_NO_VIDEO_MS = 4_000;

/** True when playback should treat prolonged no-frames as soft host-away (not server pause). */
export function shouldTreatAsLocalHostAway(args: {
  playbackActive: boolean;
  roomLifecycleLive: boolean;
  serverStreamPaused: boolean;
  videoHasData: boolean;
  msWithoutVideo: number | null;
}): boolean {
  if (!args.playbackActive || !args.roomLifecycleLive) return false;
  if (args.serverStreamPaused || args.videoHasData) return false;
  if (args.msWithoutVideo == null) return false;
  return args.msWithoutVideo >= HOST_AWAY_NO_VIDEO_MS;
}

/** Merge realtime stream_status.streamPaused into cached player metadata immediately. */
export function mergeRealtimeStreamPaused(
  stream: BuyerSafeStreamFields | null,
  streamPaused: boolean,
): BuyerSafeStreamFields | null {
  if (!stream) return stream;
  if (stream.streamPaused === streamPaused) return stream;
  return { ...stream, streamPaused };
}

/** Warm publish toggle failed → Play must leave/rejoin Stage (OS often kills it in background). */
export function shouldEscalateHostResumeToFullRejoin(warmPublishSucceeded: boolean): boolean {
  return !warmPublishSucceeded;
}

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
 * Room-scoped latch: after a **committed background** Stage leave for a room, prefer HLS for
 * **that room only** — do not poison every later show in the process.
 *
 * Why: the Stage SDK is a process-wide singleton. Leave → rejoin after OS background often
 * reconnects audio with a black native video surface. Scoping by roomId lets show→show swipe
 * keep hybrid HLS→WebRTC on the next seller.
 */
const buyerStageSubscribeTornDownRooms = new Set<string>();

function normalizeLatchRoomId(roomId: string | undefined | null): string | null {
  const id = typeof roomId === 'string' ? roomId.trim() : '';
  return id || null;
}

/** Call after a committed background Stage leave for this room. Idempotent. */
export function markBuyerStageSubscribeTornDown(roomId?: string | null): void {
  const id = normalizeLatchRoomId(roomId);
  if (id) buyerStageSubscribeTornDownRooms.add(id);
}

/**
 * Host Resume / Play, or leaving a room: clear the latch for one room (or all when omitted).
 */
export function clearBuyerStageSubscribeTornDown(roomId?: string | null): void {
  const id = normalizeLatchRoomId(roomId);
  if (!id) {
    buyerStageSubscribeTornDownRooms.clear();
    return;
  }
  buyerStageSubscribeTornDownRooms.delete(id);
}

/** True when this room's Stage leave latched WebRTC rejoin (other rooms unaffected). */
export function isBuyerStageWebrtcRejoinBlocked(roomId?: string | null): boolean {
  const id = normalizeLatchRoomId(roomId);
  if (!id) return buyerStageSubscribeTornDownRooms.size > 0;
  return buyerStageSubscribeTornDownRooms.has(id);
}

/** Test-only reset. */
export function resetBuyerStageSubscribeTornDownForTests(): void {
  buyerStageSubscribeTornDownRooms.clear();
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
 * - After a buyer background `leaveStage` for **this room**: prefer the HLS mirror and do **not**
 *   re-arm the WebRTC upgrade (native leave→rejoin often reconnects audio with a black video
 *   surface). If there is no HLS URL, WebRTC is still allowed — black is better than no attempt.
 *   Other rooms are unaffected (latch is room-scoped).
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
  /** Room id for the room-scoped post-background WebRTC latch. */
  roomId?: string | null;
  /**
   * True once the current re-entry attempt tried HLS and it never reached first-frame within the
   * watchdog window. When set, the planner stops preferring the (proven-unplayable) HLS mirror and
   * forces the WebRTC surface instead — except after a buyer Stage leave for this room, where
   * WebRTC rejoin is blocked (poisoned singleton). Presence of a `playbackUrl` is NOT proof HLS is
   * playable.
   */
  hlsStalled?: boolean;
}): ActiveTransportPlan {
  const rejoinBlocked = isBuyerStageWebrtcRejoinBlocked(input.roomId);
  const eligible = shouldUseStageWebrtcPlayback(input.stream, input.webrtcFailed, input.accessToken);
  const hlsAttachable = shouldAttachHlsPlayback(input.stream.streamHealth, input.stream.playbackUrl);

  if (input.isActive && eligible) {
    // Post-leave: stay on HLS when the mirror exists — never force Stage rejoin. `hlsStalled` used
    // to override this and remount WebRTC after background leave, which start/stops forever on a
    // poisoned IVS Stage singleton until the app is force-closed.
    if (rejoinBlocked && hlsAttachable) {
      return { transport: 'hls', armUpgrade: false };
    }
    // HLS was tried this attempt and never painted — do not keep preferring a dead mirror. Fall
    // over to a fresh WebRTC surface (the caller remounts the native view for a clean binding).
    if (input.hlsStalled) {
      return { transport: 'webrtc', armUpgrade: false };
    }
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

/** Stage sellers publish WebRTC — buyers subscribe for sub-second video; HLS is failover / mirror. */
export function preferHlsOverWebrtcOnClient(): boolean {
  return false;
}

/** Whether the buyer should attempt IVS Real-Time Stage subscribe (before one-shot HLS failover). */
export function shouldUseStageWebrtcPlayback(
  stream: Pick<BuyerSafeStreamFields, 'streamMode' | 'stageAvailable' | 'streamHealth'>,
  webrtcFailed: boolean,
  accessToken?: string,
): boolean {
  // Note: `isBuyerStageWebrtcRejoinBlocked` is applied in `resolveSurfaceTransportPlan` so that
  // post-leave visits prefer HLS when a mirror URL exists, but can still attempt WebRTC when it
  // does not (hard-blocking WebRTC with no HLS left stage shows with no video at all).
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
