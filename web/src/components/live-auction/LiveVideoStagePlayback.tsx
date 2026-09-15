"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import {
  browserCanLoadHlsJsBundle,
  isLiveStreamSignal,
  liveStageObjectFitForPlayback,
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  preferNativeHlsElementPlayback,
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from "@/lib/live-stream-playback";
import { isLiveDebugEnabled, logLiveDebugEvent } from "@/lib/live-debug";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";
import { isStageWebrtcEnabled, isWebRtcPlaybackSupported, useStageSubscribe } from "@/hooks/useStageSubscribe";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import {
  formatScheduledStartLong,
  getCountdownParts,
  pad2,
  parseScheduledStartMs,
  resolveScheduledPrereleasePhase,
} from "@/lib/live-stream-scheduled";

type LiveVideoStagePlaybackProps = {
  liveRoomId: string;
  /** Room lifecycle from app (scheduled vs live) — copy only; stream health drives video. */
  roomLifecycleLive: boolean;
  /** DB room status — keeps pre-live countdown visible before the host goes live. */
  roomStatus?: LiveRoomStatus;
  /** Signed-in viewer — guests skip WebRTC and use HLS fallback immediately. */
  viewerAuthenticated?: boolean;
  /** Incremented on `stream_status` / reconnect so the player refetches buyer-safe stream info. */
  streamPlaybackRefreshNonce?: number;
  /** Room `scheduledStartAt` (ISO) for premium pre-live messaging. */
  scheduledStartAt?: string | null;
  /** Host-uploaded thumbnail. Shown as background placeholder until live video starts playing. */
  thumbnailUrl?: string | null;
  /** Short looping promo for scheduled rooms. */
  teaserVideoUrl?: string | null;
  onNotifyMe?: () => void;
  /** Fill the stage edge-to-edge instead of nested 9:16 letterbox plate. */
  fillPortraitFrame?: boolean;
};

/** Whether `value` looks safe to render as an `<img src>` (uploaded URL or root-relative path). */
function isUsableThumbnail(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/") || v.startsWith("data:image");
}

const POLL_MS = 5_000;
const MAX_PLAYER_RETRIES = 5;
const MAX_WEBRTC_FAILOVERS = 2;
const BACKOFF_BASE_MS = 900;
/** While the room is live, re-probe playback if video stays blank this long. */
const LIVE_PLAYBACK_HEALTH_MS = 15_000;
const NO_VIDEO_RECOVER_MS = 12_000;
/**
 * The Stage→Channel HLS mirror can take several seconds to start producing segments after go-live.
 * Suppress the hard "couldn't load stream" error during this warm-up window so guests see a steady
 * "connecting" state instead of the error flashing on/off every retry cycle.
 */
const STREAM_WARMUP_GRACE_MS = 45_000;

/** Shared low-latency HLS.js tuning — used by both the seller center stage and buyer room. */
const HLS_LOW_LATENCY_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  // Stay ~1 segment behind live; larger counts add multi-second OBS delay.
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 2,
  // Catch up gently before seeking when the playlist advances.
  maxLiveSyncPlaybackRate: 1.5,
  backBufferLength: 4,
  maxBufferLength: 4,
  maxMaxBufferLength: 6,
} as const;

/** Seek when playback drifts more than this far behind the live edge. */
const LIVE_EDGE_DRIFT_THRESHOLD_S = 3;
/** Land this many seconds behind the live edge after a corrective seek. */
const LIVE_EDGE_TARGET_OFFSET_S = 0.75;
/** How often the live-edge correction loop runs while a stream is playing. */
const LIVE_EDGE_TICK_MS = 1000;
/** Minimum gap between corrective seeks so we never thrash the decoder. */
const LIVE_EDGE_SEEK_COOLDOWN_MS = 2500;

const round1 = (n: number) => Math.round(n * 10) / 10;

export type LiveEdgeMetrics = {
  currentTime: number;
  seekableEnd: number | null;
  liveSyncPosition: number | null;
  /** True live edge in seconds (seekable end preferred → liveSyncPosition → duration). */
  liveEdge: number;
  driftSeconds: number;
};

/**
 * Reads the true live-edge position. We intentionally prefer `seekable.end` (the actual edge of the
 * playlist window) over HLS.js `liveSyncPosition` (which is already offset back by liveSyncDuration),
 * so reported drift reflects how far behind real-time the viewer is.
 */
function readLiveEdgeMetrics(el: HTMLVideoElement, hls: Hls | null): LiveEdgeMetrics {
  const sync = hls?.liveSyncPosition;
  const liveSyncPosition = typeof sync === "number" && Number.isFinite(sync) ? sync : null;

  let seekableEnd: number | null = null;
  if (el.seekable && el.seekable.length > 0) {
    const end = el.seekable.end(el.seekable.length - 1);
    if (Number.isFinite(end)) seekableEnd = end;
  }

  const liveEdge =
    seekableEnd ??
    liveSyncPosition ??
    (Number.isFinite(el.duration) ? el.duration : Number.NaN);
  const currentTime = el.currentTime;
  const driftSeconds = Number.isFinite(liveEdge) ? liveEdge - currentTime : Number.NaN;
  return { currentTime, seekableEnd, liveSyncPosition, liveEdge, driftSeconds };
}

/**
 * Pins playback to the live edge. Runs repeatedly (HLS frag/level events, a polling loop, and on
 * native Safari/iOS via `seekable.end`) — not just once on attach — so a player that started 30-60s
 * behind is dragged forward to within {@link LIVE_EDGE_TARGET_OFFSET_S}s of live and kept there.
 */
function enforceLiveEdge(opts: {
  el: HTMLVideoElement;
  hls: Hls | null;
  roomId: string;
  source: string;
  verbose: boolean;
  lastSeekAtRef: { current: number };
  onMetrics?: (metrics: LiveEdgeMetrics) => void;
}): void {
  const { el, hls, roomId, source, verbose, lastSeekAtRef, onMetrics } = opts;
  const metrics = readLiveEdgeMetrics(el, hls);
  onMetrics?.(metrics);

  if (verbose) {
    logIvsWeb("live edge check", {
      roomId,
      source,
      currentTime: round1(metrics.currentTime),
      seekableEnd: metrics.seekableEnd != null ? round1(metrics.seekableEnd) : null,
      liveSyncPosition: metrics.liveSyncPosition != null ? round1(metrics.liveSyncPosition) : null,
      driftSeconds: Number.isFinite(metrics.driftSeconds) ? round1(metrics.driftSeconds) : null,
    });
  }

  if (
    Number.isFinite(metrics.driftSeconds) &&
    metrics.driftSeconds > LIVE_EDGE_DRIFT_THRESHOLD_S &&
    Number.isFinite(metrics.liveEdge) &&
    !el.paused &&
    !el.ended
  ) {
    const now = Date.now();
    if (now - lastSeekAtRef.current < LIVE_EDGE_SEEK_COOLDOWN_MS) return;
    const target = Math.max(0, metrics.liveEdge - LIVE_EDGE_TARGET_OFFSET_S);
    try {
      el.currentTime = target;
      lastSeekAtRef.current = now;
      logIvsWeb("live edge seek", {
        roomId,
        source,
        from: round1(metrics.currentTime),
        to: round1(target),
        driftSeconds: round1(metrics.driftSeconds),
      });
    } catch {
      /* seeking can throw if not yet seekable; the loop retries on the next tick */
    }
  }
}

/**
 * Host stream + create-show thumbnail are portrait 9:16, letterboxed inside the stage.
 * One sizing path for all breakpoints: fill width up to the stage, cap height, let aspect-ratio
 * shrink width when the stage is short (iPad / PC) — avoids md:h-full chains that break in flex.
 */
const PORTRAIT_LIVE_PLATE =
  "relative aspect-[9/16] h-auto max-h-full w-full max-w-full min-h-0 shrink-0 self-center overflow-hidden";

export function LiveVideoStagePlayback({
  liveRoomId,
  roomLifecycleLive,
  roomStatus,
  viewerAuthenticated = false,
  streamPlaybackRefreshNonce,
  scheduledStartAt = null,
  thumbnailUrl = null,
  teaserVideoUrl = null,
  onNotifyMe,
  fillPortraitFrame = false,
}: LiveVideoStagePlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const teaserVideoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mutedRef = useRef(false);
  const pollRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const backoffTimerRef = useRef<number | null>(null);
  const lastAttachedKeyRef = useRef<string>("");
  /** Bumped when a new attach starts or on unmount so stale async HLS setup cannot attach twice. */
  const attachEpochRef = useRef(0);
  /** Log channel latency mode only once per mount to avoid per-poll log spam. */
  const loggedLatencyModeRef = useRef(false);
  /** Live-edge correction loop timer + last corrective-seek timestamp (cooldown guard). */
  const liveEdgeTimerRef = useRef<number | null>(null);
  const lastLiveSeekAtRef = useRef(0);
  /** Active delivery transport. Ref mirrors state for use inside async fetchStream. */
  const transportRef = useRef<"none" | "webrtc" | "hls">("none");
  /** Set once WebRTC subscribe has failed for this signal, so we don't loop and stick to HLS. */
  const webrtcFailedRef = useRef(false);
  const webrtcFailoverCountRef = useRef(0);
  const noVideoSinceRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [streamHealth, setStreamHealth] = useState("offline");
  const [streamPaused, setStreamPaused] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [videoHasData, setVideoHasData] = useState(false);
  const [playerFatal, setPlayerFatal] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  /** Teaser starts muted for browser autoplay; tap Unmute for sound. */
  const [teaserMuted, setTeaserMuted] = useState(true);
  const [debugEngine, setDebugEngine] = useState<"none" | "hls" | "native">("none");
  const [hlsFatalRetries, setHlsFatalRetries] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  const [latencyMode, setLatencyMode] = useState<string | null>(null);
  const [liveDebug, setLiveDebug] = useState<{ drift: number | null; liveEdge: number | null; currentTime: number } | null>(null);
  const [streamMode, setStreamMode] = useState<string>("channel_hls");
  const [stageAvailable, setStageAvailable] = useState(false);
  const [inStreamWarmupGrace, setInStreamWarmupGrace] = useState(true);
  const [transport, setTransport] = useState<"none" | "webrtc" | "hls">("none");
  /** Forces useStageSubscribe to leave + rejoin (visibility resume, recoverable disconnect). */
  const [webrtcSubscribeEpoch, setWebrtcSubscribeEpoch] = useState(0);
  mutedRef.current = muted;

  const scheduledStartMs = useMemo(() => parseScheduledStartMs(scheduledStartAt), [scheduledStartAt]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (roomLifecycleLive) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [roomLifecycleLive]);

  useEffect(() => {
    if (!roomLifecycleLive) {
      setInStreamWarmupGrace(true);
      return;
    }
    setInStreamWarmupGrace(true);
    const id = window.setTimeout(() => setInStreamWarmupGrace(false), STREAM_WARMUP_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [roomLifecycleLive]);

  const detachHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const el = videoRef.current;
    if (el) {
      el.removeAttribute("src");
      el.load();
    }
  }, []);

  const tryPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    void el
      .play()
      .then(() => {
        logIvsWeb("playback started", {
          roomId: liveRoomId,
          currentTime: round1(el.currentTime),
          duration: Number.isFinite(el.duration) ? round1(el.duration) : "live",
        });
        enforceLiveEdge({
          el,
          hls: hlsRef.current,
          roomId: liveRoomId,
          source: "play_start",
          verbose: true,
          lastSeekAtRef: lastLiveSeekAtRef,
        });
      })
      .catch((playErr) => {
        logIvsWeb("buyer playback error", {
          roomId: liveRoomId,
          reason: "autoplay_blocked",
          message: playErr instanceof Error ? playErr.message : "play_rejected",
        });
        setAutoplayBlocked(true);
      });
  }, [liveRoomId]);

  const attachSource = useCallback(
    async (url: string, health: string) => {
      const epoch = ++attachEpochRef.current;
      const el = videoRef.current;
      if (!el || !shouldAttachHlsPlayback(health, url)) {
        setDebugEngine("none");
        detachHls();
        setVideoHasData(false);
        return;
      }

      detachHls();
      if (epoch !== attachEpochRef.current) return;

      setPlayerFatal(false);
      setVideoHasData(false);
      setAutoplayBlocked(false);
      el.muted = mutedRef.current;
      el.volume = 1;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");

      const canNativeHls = el.canPlayType("application/vnd.apple.mpegurl") !== "";
      const useNativeHlsFirst = preferNativeHlsElementPlayback() && canNativeHls;

      const attachNativeHls = () => {
        setDebugEngine("native");
        el.removeAttribute("src");
        el.load();
        el.src = url;
        el.load();
        let ready = false;
        const onNativeReady = () => {
          if (epoch !== attachEpochRef.current || ready) return;
          if (el.readyState < 2) return;
          ready = true;
          setVideoHasData(true);
          tryPlay();
        };
        const onNativeError = () => {
          if (epoch !== attachEpochRef.current || ready) return;
          logIvsWeb("buyer playback error", {
            roomId: liveRoomId,
            reason: "native_hls_error",
            message: el.error?.message ?? "native_element_error",
          });
          const n = retryRef.current + 1;
          if (n <= MAX_PLAYER_RETRIES) {
            retryRef.current = n;
            setHlsFatalRetries(n);
            const delay = Math.min(30_000, BACKOFF_BASE_MS * 2 ** (n - 1));
            if (backoffTimerRef.current != null) window.clearTimeout(backoffTimerRef.current);
            backoffTimerRef.current = window.setTimeout(() => {
              backoffTimerRef.current = null;
              void attachSource(url, health);
            }, delay);
          } else {
            setPlayerFatal(true);
          }
        };
        el.addEventListener("loadeddata", onNativeReady);
        el.addEventListener("canplay", onNativeReady);
        el.addEventListener("playing", onNativeReady);
        el.addEventListener("error", onNativeError, { once: true });
      };

      if (useNativeHlsFirst) {
        if (epoch !== attachEpochRef.current) return;
        attachNativeHls();
        return;
      }

      // Never fetch the hls.js chunk on engines that cannot parse optional chaining — script
      // evaluation throws a global SyntaxError that Sentry reports even when import() is awaited.
      if (!browserCanLoadHlsJsBundle()) {
        if (epoch !== attachEpochRef.current) return;
        if (canNativeHls) {
          attachNativeHls();
          return;
        }
        setDebugEngine("none");
        setPlayerFatal(true);
        return;
      }

      try {
        const { default: HlsCtor } = await import("hls.js");
        if (epoch !== attachEpochRef.current) return;
        if (HlsCtor.isSupported()) {
          setDebugEngine("hls");
          const hls = new HlsCtor({ ...HLS_LOW_LATENCY_CONFIG });
          logIvsWeb("hls lowLatencyMode enabled", {
            roomId: liveRoomId,
            lowLatencyMode: HLS_LOW_LATENCY_CONFIG.lowLatencyMode,
            liveSyncDurationCount: HLS_LOW_LATENCY_CONFIG.liveSyncDurationCount,
            liveMaxLatencyDurationCount: HLS_LOW_LATENCY_CONFIG.liveMaxLatencyDurationCount,
            backBufferLength: HLS_LOW_LATENCY_CONFIG.backBufferLength,
          });
          if (epoch !== attachEpochRef.current) {
            hls.destroy();
            return;
          }
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(el);
          hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
            if (epoch !== attachEpochRef.current) return;
            setHlsFatalRetries(0);
            setVideoHasData(true);
            tryPlay();
          });
          const pinLiveEdge = (source: string) => {
            const videoEl = videoRef.current;
            if (!videoEl) return;
            enforceLiveEdge({
              el: videoEl,
              hls,
              roomId: liveRoomId,
              source,
              verbose: false,
              lastSeekAtRef: lastLiveSeekAtRef,
            });
          };
          hls.on(HlsCtor.Events.LEVEL_UPDATED, () => pinLiveEdge("level_updated"));
          hls.on(HlsCtor.Events.FRAG_CHANGED, () => pinLiveEdge("frag_changed"));
          // Re-pin to the live edge on every playlist/segment update, not just once on attach.
          hls.on(HlsCtor.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            if (epoch !== attachEpochRef.current) return;
            setPlayerFatal(true);
            detachHls();
            const n = retryRef.current + 1;
            if (n <= MAX_PLAYER_RETRIES) {
              retryRef.current = n;
              setHlsFatalRetries(n);
              logLiveDebugEvent({
                event: "playback_hls_fatal_retry",
                roomId: liveRoomId,
                extra: { attempt: n, max: MAX_PLAYER_RETRIES },
              });
              const delay = Math.min(30_000, BACKOFF_BASE_MS * 2 ** (n - 1));
              if (backoffTimerRef.current != null) window.clearTimeout(backoffTimerRef.current);
              backoffTimerRef.current = window.setTimeout(() => {
                backoffTimerRef.current = null;
                void attachSource(url, health);
              }, delay);
            } else {
              logLiveDebugEvent({
                event: "playback_hls_fatal_exhausted",
                roomId: liveRoomId,
                extra: { attempts: MAX_PLAYER_RETRIES },
              });
            }
          });
          return;
        }
      } catch {
        /* fall through to native */
      }

      if (epoch !== attachEpochRef.current) return;
      if (canNativeHls) {
        attachNativeHls();
        return;
      }

      setDebugEngine("none");
      setPlayerFatal(true);
    },
    [detachHls, tryPlay, liveRoomId],
  );

  const fetchStream = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/stream`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        logIvsWeb("buyer playback error", { roomId: liveRoomId, reason: "stream_fetch_http", httpStatus: res.status });
        setFetchFailed(true);
        setLoading(false);
        return;
      }
      setFetchFailed(false);
      const safe = parseBuyerSafeStreamPayload(raw);
      if (!safe) {
        logIvsWeb("buyer playback error", { roomId: liveRoomId, reason: "stream_payload_invalid" });
        setFetchFailed(true);
        setLoading(false);
        return;
      }
      setStreamHealth(safe.streamHealth);
      setStreamPaused(safe.streamPaused);
      setPlaybackUrl(safe.playbackUrl);
      setLatencyMode(safe.latencyMode ?? null);
      setStreamMode(safe.streamMode);
      setStageAvailable(safe.stageAvailable);
      if (!loggedLatencyModeRef.current) {
        loggedLatencyModeRef.current = true;
        logIvsWeb("channel latency mode", {
          roomId: liveRoomId,
          latencyMode: safe.latencyMode ?? "unknown",
        });
      }
      if (safe.playbackUrl) {
        logIvsWeb("buyer playback url loaded", {
          roomId: liveRoomId,
          streamHealth: safe.streamHealth,
          attachHls: shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl),
        });
      }
      setLastSyncAt(safe.lastStatusSyncAt);
      setLoading(false);
      retryRef.current = 0;
      setHlsFatalRetries(0);

      // Host paused: stop painting/decoding video under the standby screen (OBS may still ingest).
      if (safe.streamPaused) {
        transportRef.current = "none";
        setTransport("none");
        lastAttachedKeyRef.current = "";
        setDebugEngine("none");
        detachHls();
        setVideoHasData(false);
        return;
      }

      const signalLive = isLiveStreamSignal(safe.streamHealth);
      // A fresh live signal resets the one-shot WebRTC failover guard so a new Go Live retries WebRTC.
      if (!signalLive) {
        webrtcFailedRef.current = false;
        webrtcFailoverCountRef.current = 0;
      }

      const wantWebrtc =
        viewerAuthenticated &&
        isStageWebrtcEnabled() &&
        !preferHlsOverWebrtcOnClient() &&
        safe.streamMode === "stage_webrtc" &&
        safe.stageAvailable &&
        isWebRtcPlaybackSupported() &&
        !webrtcFailedRef.current &&
        signalLive;

      if (wantWebrtc) {
        if (transportRef.current !== "webrtc") {
          transportRef.current = "webrtc";
          setTransport("webrtc");
          lastAttachedKeyRef.current = "";
          setDebugEngine("none");
          detachHls();
          setVideoHasData(false);
          logIvsWeb("transport selected", { roomId: liveRoomId, transport: "webrtc" });
        }
        // The WebRTC subscribe hook drives playback (attach/teardown) from here.
        return;
      }

      const attachKey = `${safe.playbackUrl ?? ""}|${safe.streamHealth}`;
      if (shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl) && safe.playbackUrl) {
        if (transportRef.current !== "hls") {
          transportRef.current = "hls";
          setTransport("hls");
          logIvsWeb("transport selected", { roomId: liveRoomId, transport: "hls" });
        }
        if (lastAttachedKeyRef.current !== attachKey) {
          lastAttachedKeyRef.current = attachKey;
          await attachSource(safe.playbackUrl, safe.streamHealth);
        }
      } else {
        transportRef.current = "none";
        setTransport("none");
        lastAttachedKeyRef.current = "";
        setDebugEngine("none");
        detachHls();
        setVideoHasData(false);
      }
    } catch (fetchErr) {
      logIvsWeb("buyer playback error", {
        roomId: liveRoomId,
        reason: "stream_fetch_throw",
        message: fetchErr instanceof Error ? fetchErr.message : "unknown",
      });
      setFetchFailed(true);
      setLoading(false);
    }
  }, [attachSource, detachHls, liveRoomId, viewerAuthenticated]);

  useEffect(() => {
    void fetchStream();
    pollRef.current = window.setInterval(() => void fetchStream(), POLL_MS);
    return () => {
      attachEpochRef.current += 1;
      if (pollRef.current != null) window.clearInterval(pollRef.current);
      if (backoffTimerRef.current != null) window.clearTimeout(backoffTimerRef.current);
      detachHls();
    };
  }, [detachHls, fetchStream]);

  useEffect(() => {
    if (streamPlaybackRefreshNonce == null || streamPlaybackRefreshNonce < 1) return;
    if (backoffTimerRef.current != null) {
      window.clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    attachEpochRef.current += 1;
    retryRef.current = 0;
    lastAttachedKeyRef.current = "";
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    noVideoSinceRef.current = null;
    transportRef.current = "none";
    setTransport("none");
    setWebrtcSubscribeEpoch((n) => n + 1);
    setPlayerFatal(false);
    setHlsFatalRetries(0);
    logLiveDebugEvent({
      event: "playback_stream_refresh_nonce",
      roomId: liveRoomId,
      extra: { nonce: streamPlaybackRefreshNonce },
    });
    void fetchStream();
  }, [streamPlaybackRefreshNonce, fetchStream, liveRoomId]);

  const handleWebrtcConnected = useCallback(() => {
    setVideoHasData(true);
    setReconnecting(false);
    noVideoSinceRef.current = null;
    webrtcFailoverCountRef.current = 0;
    webrtcFailedRef.current = false;
    logIvsWeb("buyer playback connected", { roomId: liveRoomId, transport: "webrtc" });
  }, [liveRoomId]);

  const handleWebrtcDisconnected = useCallback(() => {
    setVideoHasData(false);
    setReconnecting(true);
    if (noVideoSinceRef.current == null) noVideoSinceRef.current = Date.now();
    logLiveDebugEvent({ event: "playback_webrtc_disconnected", roomId: liveRoomId, extra: {} });
  }, [liveRoomId]);

  const handleWebrtcFailed = useCallback(
    (reason: string) => {
      webrtcFailoverCountRef.current += 1;
      setVideoHasData(false);
      setReconnecting(false);
      logIvsWeb("buyer playback error", {
        roomId: liveRoomId,
        reason: `webrtc_${reason}`,
        failoverAttempt: webrtcFailoverCountRef.current,
      });
      if (webrtcFailoverCountRef.current >= MAX_WEBRTC_FAILOVERS) {
        webrtcFailedRef.current = true;
        transportRef.current = "hls";
        setTransport("hls");
        lastAttachedKeyRef.current = "";
        setVideoHasData(false);
        logIvsWeb("buyer playback error", { roomId: liveRoomId, reason: "webrtc_failover_hls", fallback: "hls" });
        void fetchStream();
        return;
      }
      transportRef.current = "webrtc";
      setTransport("webrtc");
      setWebrtcSubscribeEpoch((n) => n + 1);
      setReconnecting(true);
      window.setTimeout(() => setReconnecting(false), 800);
    },
    [fetchStream, liveRoomId],
  );

  useStageSubscribe({
    roomId: liveRoomId,
    videoRef,
    active: transport === "webrtc" && !streamPaused,
    muted,
    refreshNonce: streamPlaybackRefreshNonce,
    subscribeEpoch: webrtcSubscribeEpoch,
    onConnected: handleWebrtcConnected,
    onFailed: handleWebrtcFailed,
    onDisconnected: handleWebrtcDisconnected,
  });

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (backoffTimerRef.current != null) {
          window.clearTimeout(backoffTimerRef.current);
          backoffTimerRef.current = null;
        }
        return;
      }
      if (document.visibilityState !== "visible") return;
      lastAttachedKeyRef.current = "";
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      noVideoSinceRef.current = null;
      setReconnecting(true);
      if (transportRef.current === "webrtc") {
        setWebrtcSubscribeEpoch((n) => n + 1);
      } else {
        transportRef.current = "none";
        setTransport("none");
      }
      logLiveDebugEvent({ event: "playback_visibility_resume", roomId: liveRoomId, extra: {} });
      void fetchStream().finally(() => {
        window.setTimeout(() => setReconnecting(false), 600);
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchStream, liveRoomId]);

  useEffect(() => {
    if (videoHasData || !isLiveStreamSignal(streamHealth) || !roomLifecycleLive) {
      noVideoSinceRef.current = null;
      return;
    }
    if (noVideoSinceRef.current == null) noVideoSinceRef.current = Date.now();
  }, [videoHasData, streamHealth, roomLifecycleLive]);

  useEffect(() => {
    if (!isLiveStreamSignal(streamHealth) || !roomLifecycleLive) return;
    const id = window.setInterval(() => {
      if (videoHasData) return;
      const since = noVideoSinceRef.current;
      if (since == null || Date.now() - since < NO_VIDEO_RECOVER_MS) return;
      noVideoSinceRef.current = Date.now();
      lastAttachedKeyRef.current = "";
      setPlayerFatal(false);
      setHlsFatalRetries(0);
      // WebRTC has yielded no host video for the whole recover window. Escalate toward the HLS
      // mirror instead of resetting the failover counter — the reset was trapping buyers on a
      // never-playing WebRTC subscribe while the Stage→Channel HLS mirror was live.
      if (transportRef.current === "webrtc") {
        webrtcFailoverCountRef.current += 1;
        if (webrtcFailoverCountRef.current >= MAX_WEBRTC_FAILOVERS) {
          webrtcFailedRef.current = true;
          transportRef.current = "hls";
          setTransport("hls");
          setVideoHasData(false);
          logIvsWeb("buyer playback error", {
            roomId: liveRoomId,
            reason: "webrtc_novideo_failover_hls",
            fallback: "hls",
          });
          void fetchStream();
          return;
        }
        logIvsWeb("buyer playback health recover", {
          roomId: liveRoomId,
          transport: "webrtc",
          failoverAttempt: webrtcFailoverCountRef.current,
        });
        setWebrtcSubscribeEpoch((n) => n + 1);
        void fetchStream();
        return;
      }
      // Already latched to HLS via failover — retry HLS re-attach without flipping back to a
      // dead WebRTC subscribe.
      logIvsWeb("buyer playback health recover", { roomId: liveRoomId, transport: transportRef.current });
      transportRef.current = webrtcFailedRef.current ? "hls" : "none";
      setTransport(transportRef.current);
      void fetchStream();
    }, LIVE_PLAYBACK_HEALTH_MS);
    return () => window.clearInterval(id);
  }, [streamHealth, roomLifecycleLive, videoHasData, fetchStream, liveRoomId]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = muted;
      el.volume = 1;
    }
  }, [muted]);

  // Continuous live-edge correction loop. Runs for BOTH HLS.js and native Safari/iOS (which ignores
  // HLS.js config and needs `seekable.end`-based correction), repeatedly dragging playback to live.
  useEffect(() => {
    // Only the HLS path needs live-edge correction; WebRTC is inherently at the edge (~0 drift).
    const active =
      transport === "hls" && videoHasData && Boolean(playbackUrl) && shouldAttachHlsPlayback(streamHealth, playbackUrl);
    if (!active) {
      setLiveDebug(null);
      return;
    }
    const id = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      const verbose = isLiveDebugEnabled();
      enforceLiveEdge({
        el,
        hls: hlsRef.current,
        roomId: liveRoomId,
        source: "interval",
        verbose,
        lastSeekAtRef: lastLiveSeekAtRef,
        onMetrics: verbose
          ? (m) =>
              setLiveDebug({
                drift: Number.isFinite(m.driftSeconds) ? round1(m.driftSeconds) : null,
                liveEdge: Number.isFinite(m.liveEdge) ? round1(m.liveEdge) : null,
                currentTime: round1(m.currentTime),
              })
          : undefined,
      });
    }, LIVE_EDGE_TICK_MS);
    liveEdgeTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      liveEdgeTimerRef.current = null;
    };
  }, [transport, videoHasData, streamHealth, playbackUrl, liveRoomId]);

  const hlsSurfaceRaw = resolveLivePlaybackSurfaceState({
    loading,
    fetchFailed,
    reconnecting,
    streamHealth,
    playbackUrl,
    videoHasRenderableData: videoHasData,
    playerFatal,
    roomLifecycleLive,
  });
  // The Stage→Channel HLS mirror can take several seconds to warm up after go-live — don't flash
  // the hard error at guests while that's still plausibly in progress.
  const hlsSurface = hlsSurfaceRaw === "error" && inStreamWarmupGrace ? "connecting" : hlsSurfaceRaw;
  // WebRTC has no playbackUrl, so the HLS-oriented surface resolver can't classify it — drive it
  // off connection state (videoHasData) instead.
  const surface =
    transport === "webrtc"
      ? reconnecting
        ? "reconnecting"
        : videoHasData
          ? "live"
          : roomLifecycleLive
            ? "connecting"
            : "offline"
      : hlsSurface;

  const showVideoLayer = transport === "webrtc" || Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  const showPlaybackErrorCenter = surface === "error" && roomLifecycleLive;
  /** Match mobile LiveStagePlayback: scheduled rooms always show countdown/date overlay, even when a stale HLS URL exists. */
  const showPreLiveScheduleOverlay = !roomLifecycleLive && roomStatus !== "ended";
  const showStandbyCenter =
    (streamPaused && roomLifecycleLive) ||
    !showVideoLayer ||
    showPlaybackErrorCenter ||
    showPreLiveScheduleOverlay ||
    roomStatus === "ended";
  /**
   * Show the host-uploaded thumbnail as a placeholder behind the standby/countdown
   * content whenever the live video isn't actually painting frames yet (pre-live,
   * waiting on host signal, fetch error, etc.). Hide it as soon as the player has
   * decoded data so we never paint over the real stream.
   */
  const streamAttaching =
    roomLifecycleLive && showVideoLayer && (transport === "hls" || transport === "webrtc");
  const teaserUrl = typeof teaserVideoUrl === "string" ? teaserVideoUrl.trim() : "";
  const showTeaserLayer =
    Boolean(teaserUrl) &&
    !roomLifecycleLive &&
    roomStatus !== "ended" &&
    !videoHasData &&
    !streamAttaching;
  const showThumbnailLayer =
    isUsableThumbnail(thumbnailUrl) && !videoHasData && !streamAttaching && !showTeaserLayer;

  useEffect(() => {
    if (!showTeaserLayer) return;
    const el = teaserVideoRef.current;
    if (!el) return;
    el.loop = true;
    el.muted = teaserMuted;
    el.playsInline = true;
    void el.play().catch(() => {
      /* autoplay may still require mute — already muted by default */
    });
  }, [showTeaserLayer, teaserUrl, teaserMuted]);

  const scheduledPhase = useMemo(() => {
    if (roomLifecycleLive || !hydrated) return null;
    return resolveScheduledPrereleasePhase(Date.now(), scheduledStartMs, roomLifecycleLive);
  }, [roomLifecycleLive, hydrated, scheduledStartMs, tick]);

  const liveVideoObjectFit = liveStageObjectFitForPlayback({ streamMode, transport });
  const liveVideoFitClass =
    liveVideoObjectFit === "contain"
      ? "absolute inset-0 h-full w-full object-contain object-center opacity-[0.97]"
      : "absolute inset-0 h-full w-full object-cover object-center opacity-[0.97]";

  return (
    <div className="absolute inset-0 z-[1] overflow-hidden bg-black">
      {showThumbnailLayer && thumbnailUrl ? (
        <div className="absolute inset-0 z-[1] bg-black">
          {fillPortraitFrame ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- host-uploaded thumbnail */}
              <img
                src={thumbnailUrl}
                alt=""
                aria-hidden
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover object-center opacity-80"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden />
            </>
          ) : (
            <div className="flex min-h-0 min-w-0 size-full items-center justify-center">
              <div className={PORTRAIT_LIVE_PLATE}>
                {/* eslint-disable-next-line @next/next/no-img-element -- host-uploaded thumbnail; same 9:16 plate as live video */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover object-center opacity-80"
                />
                <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showTeaserLayer && teaserUrl ? (
        <div className="absolute inset-0 z-[1] bg-black">
          {fillPortraitFrame ? (
            <video
              ref={teaserVideoRef}
              key={teaserUrl}
              src={teaserUrl}
              className="absolute inset-0 h-full w-full object-cover object-center"
              muted={teaserMuted}
              playsInline
              loop
              autoPlay
              controls={false}
              preload="auto"
              aria-label="Show preview video"
            />
          ) : (
            <div className="flex min-h-0 min-w-0 size-full items-center justify-center">
              <div className={PORTRAIT_LIVE_PLATE}>
                <video
                  ref={teaserVideoRef}
                  key={teaserUrl}
                  src={teaserUrl}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  muted={teaserMuted}
                  playsInline
                  loop
                  autoPlay
                  controls={false}
                  preload="auto"
                  aria-label="Show preview video"
                />
              </div>
            </div>
          )}
          {teaserMuted ? (
            <button
              type="button"
              onClick={() => {
                setTeaserMuted(false);
                const el = teaserVideoRef.current;
                if (el) {
                  el.muted = false;
                  void el.play().catch(() => {});
                }
              }}
              className="pointer-events-auto absolute bottom-20 left-1/2 z-[4] -translate-x-1/2 rounded-full border border-white/25 bg-black/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white backdrop-blur-md hover:bg-black/85"
            >
              Unmute preview
            </button>
          ) : null}
        </div>
      ) : null}

      {showVideoLayer ? (
        <div className="absolute inset-0 z-[2] bg-black">
          {fillPortraitFrame ? (
            <video
              ref={videoRef}
              data-live-stage-video="true"
              className={liveVideoFitClass}
              muted={muted}
              playsInline
              controls={false}
              autoPlay
              preload="auto"
              aria-label="Live stream"
            />
          ) : (
            <div className="flex min-h-0 min-w-0 size-full items-center justify-center">
              <div className={PORTRAIT_LIVE_PLATE}>
                <video
                  ref={videoRef}
                  data-live-stage-video="true"
                  className={liveVideoFitClass}
                  muted={muted}
                  playsInline
                  controls={false}
                  autoPlay
                  preload="auto"
                  aria-label="Live stream"
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" aria-hidden />

      {showStandbyCenter ? (
        <div className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center bg-black/35 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 text-center sm:px-8">
          {roomStatus === "ended" ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Live has Ended</p>
            </div>
          ) : showPlaybackErrorCenter ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">We couldn’t load the stream right now.</p>
              <p className="text-sm leading-relaxed text-zinc-500">Refresh the page or try again in a moment.</p>
            </div>
          ) : streamPaused && roomLifecycleLive ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Host paused</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                The host stepped away briefly. Hang tight — we&apos;ll be back soon.
              </p>
            </div>
          ) : roomLifecycleLive ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Waiting for the host’s video signal</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                The host has gone live — video will appear when the stream is ready.
              </p>
            </div>
          ) : !hydrated ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-sm font-medium text-zinc-500">Preparing schedule…</p>
            </div>
          ) : scheduledPhase === "far" && scheduledStartAt ? (
            <div className="max-w-md space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">This show goes live on</p>
              <p className="text-lg font-semibold leading-snug text-zinc-50 sm:text-xl">{formatScheduledStartLong(scheduledStartAt)}</p>
              <p className="text-sm leading-relaxed text-zinc-500">Check back closer to showtime.</p>
              {onNotifyMe ? (
                <button
                  type="button"
                  onClick={onNotifyMe}
                  className="pointer-events-auto min-h-10 rounded-full border border-gold/40 bg-gold/20 px-4 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:bg-gold/30"
                >
                  Notify me
                </button>
              ) : null}
            </div>
          ) : scheduledPhase === "countdown" && scheduledStartMs != null ? (
            <div className="max-w-md space-y-5">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Live in</p>
              {(() => {
                const parts = getCountdownParts(Date.now(), scheduledStartMs);
                const h = parts.hours > 99 ? String(parts.hours) : pad2(parts.hours);
                return (
                  <div className="flex items-end justify-center gap-1.5 sm:gap-2">
                    <div className="text-center">
                      <div className="text-[clamp(1.75rem,7.5vw,2.65rem)] font-black tabular-nums leading-none tracking-tight text-gold-bright drop-shadow-[0_0_22px_rgba(234,179,8,0.2)]">
                        {h}
                      </div>
                      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">Hrs</div>
                    </div>
                    <span className="mb-5 select-none text-[clamp(1.1rem,4vw,1.65rem)] font-light leading-none text-gold-bright/45 sm:mb-6" aria-hidden>
                      :
                    </span>
                    <div className="text-center">
                      <div className="text-[clamp(1.75rem,7.5vw,2.65rem)] font-black tabular-nums leading-none tracking-tight text-gold-bright drop-shadow-[0_0_22px_rgba(234,179,8,0.2)]">
                        {pad2(parts.minutes)}
                      </div>
                      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">Min</div>
                    </div>
                    <span className="mb-5 select-none text-[clamp(1.1rem,4vw,1.65rem)] font-light leading-none text-gold-bright/45 sm:mb-6" aria-hidden>
                      :
                    </span>
                    <div className="text-center">
                      <div className="text-[clamp(1.75rem,7.5vw,2.65rem)] font-black tabular-nums leading-none tracking-tight text-gold-bright drop-shadow-[0_0_22px_rgba(234,179,8,0.2)]">
                        {pad2(parts.seconds)}
                      </div>
                      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">Sec</div>
                    </div>
                  </div>
                );
              })()}
              {onNotifyMe ? (
                <button
                  type="button"
                  onClick={onNotifyMe}
                  className="pointer-events-auto min-h-10 rounded-full border border-gold/40 bg-gold/20 px-4 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:bg-gold/30"
                >
                  Notify me
                </button>
              ) : null}
            </div>
          ) : scheduledPhase === "post_start" ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Waiting on host</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                The show is scheduled to start now. We&apos;re waiting for the host to go live.
              </p>
              {onNotifyMe ? (
                <button
                  type="button"
                  onClick={onNotifyMe}
                  className="pointer-events-auto min-h-10 rounded-full border border-gold/40 bg-gold/20 px-4 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:bg-gold/30"
                >
                  Notify me
                </button>
              ) : null}
            </div>
          ) : (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Waiting on host</p>
              <p className="text-sm leading-relaxed text-zinc-500">We&apos;ll post the stream as soon as the host connects.</p>
            </div>
          )}
        </div>
      ) : null}

      {(autoplayBlocked && showVideoLayer) || (showVideoLayer && muted && surface === "live") ? (
        <div className="absolute bottom-[max(7rem,env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[7] -translate-x-1/2 md:bottom-28">
          <button
            type="button"
            className="pointer-events-auto min-h-11 min-w-[44px] rounded-full border border-gold/40 bg-gold/15 px-5 text-xs font-bold text-gold-bright shadow-lg backdrop-blur-md hover:bg-gold/25"
            onClick={() => {
              setMuted(false);
              setAutoplayBlocked(false);
              const el = videoRef.current;
              if (el) {
                el.muted = false;
                void el.play().catch(() => setAutoplayBlocked(true));
              }
            }}
          >
            {autoplayBlocked ? "Tap to play" : "Tap for sound"}
          </button>
        </div>
      ) : null}

      {isLiveDebugEnabled() ? (
        <div
          className="pointer-events-none absolute bottom-2 right-2 z-[30] max-w-[15rem] rounded border border-amber-500/35 bg-black/88 px-2 py-1.5 font-mono text-[9px] leading-snug text-amber-100/95 shadow-lg"
          aria-hidden
        >
          <div className="mb-1 font-bold text-amber-300">Low Latency Debug</div>
          <div>transport: {transport}</div>
          <div>streamMode: {streamMode}</div>
          <div>stageAvail: {stageAvailable ? "y" : "n"}</div>
          <div>latencyMode: {latencyMode ?? "—"}</div>
          <div>hls lowLatency: {debugEngine === "hls" ? (HLS_LOW_LATENCY_CONFIG.lowLatencyMode ? "y" : "n") : "n/a"}</div>
          <div>liveEdge: {liveDebug?.liveEdge != null ? `${liveDebug.liveEdge}s` : "—"}</div>
          <div>currentTime: {liveDebug?.currentTime != null ? `${liveDebug.currentTime}s` : "—"}</div>
          <div className={liveDebug?.drift != null && liveDebug.drift > LIVE_EDGE_DRIFT_THRESHOLD_S ? "text-red-400" : ""}>
            drift: {liveDebug?.drift != null ? `${liveDebug.drift}s` : "—"}
          </div>
          <div className="my-1 border-t border-amber-500/20" />
          <div>surface: {surface}</div>
          <div>streamHealth: {streamHealth}</div>
          <div>engine: {debugEngine}</div>
          <div>
            hlsRetry: {hlsFatalRetries}/{MAX_PLAYER_RETRIES}
          </div>
          <div>fetchFailed: {fetchFailed ? "y" : "n"}</div>
          <div>playerFatal: {playerFatal ? "y" : "n"}</div>
          <div className="truncate" title={lastSyncAt ?? ""}>
            sync: {lastSyncAt ?? "—"}
          </div>
          <div>roomLive: {roomLifecycleLive ? "y" : "n"}</div>
          <div>sched: {scheduledPhase ?? "—"}</div>
        </div>
      ) : null}
    </div>
  );
}
