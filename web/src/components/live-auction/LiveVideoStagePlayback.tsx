"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import {
  parseBuyerSafeStreamPayload,
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from "@/lib/live-stream-playback";
import { isLiveDebugEnabled, logLiveDebugEvent } from "@/lib/live-debug";
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
  /** Incremented on `stream_status` / reconnect so the player refetches buyer-safe stream info. */
  streamPlaybackRefreshNonce?: number;
  /** Room `scheduledStartAt` (ISO) for premium pre-live messaging. */
  scheduledStartAt?: string | null;
  /** Host-uploaded thumbnail. Shown as background placeholder until live video starts playing. */
  thumbnailUrl?: string | null;
};

/** Whether `value` looks safe to render as an `<img src>` (uploaded URL or root-relative path). */
function isUsableThumbnail(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/") || v.startsWith("data:image");
}

const POLL_MS = 14_000;
const MAX_PLAYER_RETRIES = 5;
const BACKOFF_BASE_MS = 900;

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
  streamPlaybackRefreshNonce,
  scheduledStartAt = null,
  thumbnailUrl = null,
}: LiveVideoStagePlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mutedRef = useRef(true);
  const pollRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const backoffTimerRef = useRef<number | null>(null);
  const lastAttachedKeyRef = useRef<string>("");
  /** Bumped when a new attach starts or on unmount so stale async HLS setup cannot attach twice. */
  const attachEpochRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [streamHealth, setStreamHealth] = useState("offline");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [videoHasData, setVideoHasData] = useState(false);
  const [playerFatal, setPlayerFatal] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [debugEngine, setDebugEngine] = useState<"none" | "hls" | "native">("none");
  const [hlsFatalRetries, setHlsFatalRetries] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
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
    void el.play().catch(() => {
      setAutoplayBlocked(true);
    });
  }, []);

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
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");

      const canNativeHls = el.canPlayType("application/vnd.apple.mpegurl") !== "";

      try {
        const { default: HlsCtor } = await import("hls.js");
        if (epoch !== attachEpochRef.current) return;
        if (HlsCtor.isSupported()) {
          setDebugEngine("hls");
          const hls = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
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
        setDebugEngine("native");
        el.src = url;
        const onLoaded = () => {
          if (epoch !== attachEpochRef.current) return;
          setVideoHasData(true);
          tryPlay();
          el.removeEventListener("loadeddata", onLoaded);
        };
        el.addEventListener("loadeddata", onLoaded);
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
        setFetchFailed(true);
        setLoading(false);
        return;
      }
      setFetchFailed(false);
      const safe = parseBuyerSafeStreamPayload(raw);
      if (!safe) {
        setFetchFailed(true);
        setLoading(false);
        return;
      }
      setStreamHealth(safe.streamHealth);
      setPlaybackUrl(safe.playbackUrl);
      setLastSyncAt(safe.lastStatusSyncAt);
      setLoading(false);
      retryRef.current = 0;
      setHlsFatalRetries(0);

      const attachKey = `${safe.playbackUrl ?? ""}|${safe.streamHealth}`;
      if (shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl) && safe.playbackUrl) {
        if (lastAttachedKeyRef.current !== attachKey) {
          lastAttachedKeyRef.current = attachKey;
          await attachSource(safe.playbackUrl, safe.streamHealth);
        }
      } else {
        lastAttachedKeyRef.current = "";
        setDebugEngine("none");
        detachHls();
        setVideoHasData(false);
      }
    } catch {
      setFetchFailed(true);
      setLoading(false);
    }
  }, [attachSource, detachHls, liveRoomId]);

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
    setPlayerFatal(false);
    setHlsFatalRetries(0);
    logLiveDebugEvent({
      event: "playback_stream_refresh_nonce",
      roomId: liveRoomId,
      extra: { nonce: streamPlaybackRefreshNonce },
    });
    void fetchStream();
  }, [streamPlaybackRefreshNonce, fetchStream, liveRoomId]);

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
      setReconnecting(true);
      logLiveDebugEvent({ event: "playback_visibility_resume", roomId: liveRoomId, extra: {} });
      void fetchStream().finally(() => {
        window.setTimeout(() => setReconnecting(false), 600);
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchStream, liveRoomId]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  const surface = resolveLivePlaybackSurfaceState({
    loading,
    fetchFailed,
    reconnecting,
    streamHealth,
    playbackUrl,
    videoHasRenderableData: videoHasData,
    playerFatal,
    roomLifecycleLive,
  });

  const showVideoLayer = Boolean(playbackUrl && shouldAttachHlsPlayback(streamHealth, playbackUrl));
  const showPlaybackErrorCenter = surface === "error" && roomLifecycleLive;
  const showStandbyCenter = !showVideoLayer || showPlaybackErrorCenter;
  /**
   * Show the host-uploaded thumbnail as a placeholder behind the standby/countdown
   * content whenever the live video isn't actually painting frames yet (pre-live,
   * waiting on host signal, fetch error, etc.). Hide it as soon as the player has
   * decoded data so we never paint over the real stream.
   */
  const showThumbnailLayer = isUsableThumbnail(thumbnailUrl) && (!showVideoLayer || !videoHasData);

  const scheduledPhase = useMemo(() => {
    if (roomLifecycleLive || !hydrated) return null;
    return resolveScheduledPrereleasePhase(Date.now(), scheduledStartMs, roomLifecycleLive);
  }, [roomLifecycleLive, hydrated, scheduledStartMs, tick]);

  return (
    <div className="absolute inset-0 z-[1] overflow-hidden bg-black">
      {showThumbnailLayer && thumbnailUrl ? (
        <div className="absolute inset-0 z-[1] flex min-h-0 min-w-0 size-full items-center justify-center bg-black">
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
      ) : null}

      {showVideoLayer ? (
        <div className="absolute inset-0 z-[2] flex min-h-0 min-w-0 size-full items-center justify-center bg-black">
          <div className={PORTRAIT_LIVE_PLATE}>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.97]"
              muted={muted}
              playsInline
              controls={false}
              autoPlay
              preload="metadata"
              aria-label="Live stream"
            />
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" aria-hidden />

      {showStandbyCenter ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 text-center sm:px-8">
          {showPlaybackErrorCenter ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">We couldn’t load the stream right now.</p>
              <p className="text-sm leading-relaxed text-zinc-500">Refresh the page or try again in a moment.</p>
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
            </div>
          ) : scheduledPhase === "post_start" ? (
            <div className="max-w-md space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Vaulted Live</p>
              <p className="text-base font-semibold tracking-tight text-zinc-100">Waiting on host</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                The show is scheduled to start now. We&apos;re waiting for the host to go live.
              </p>
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
