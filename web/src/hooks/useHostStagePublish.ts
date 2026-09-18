"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalStageStream,
  Stage,
  StageConnectionState as StageConnectionStateType,
  StageError,
  StageStrategy,
  StageVideoConfiguration,
} from "amazon-ivs-web-broadcast";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";

export type HostBroadcastPhase = "idle" | "preview" | "starting" | "live" | "paused" | "stopping";

type StageTokenResponse = {
  error?: string;
  stage?: {
    token?: string;
    participantId?: string;
    stageArn?: string;
    expiresInSeconds?: number;
  };
};

export type HostMediaDevices = {
  video: MediaDeviceInfo[];
  audio: MediaDeviceInfo[];
};

function friendlyMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Camera and microphone access was denied. Allow permissions in your browser settings, then try again.";
    }
    if (err.name === "NotFoundError") {
      return "No camera or microphone was found on this device.";
    }
    if (err.name === "NotReadableError") {
      return "Your camera or microphone is in use by another app. Close it and try again.";
    }
    if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
      return "Your camera or microphone doesn't support the requested settings. Try selecting a different camera below.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not access camera or microphone.";
}

/** Max automatic publish rejoin attempts before surfacing an error to the host. */
const HOST_MAX_REJOIN_ATTEMPTS = 5;
/** Proactive host token refresh before the 12-hour server TTL expires. */
const HOST_TOKEN_REFRESH_MS = 11 * 60 * 60 * 1000;

/** Persists the seller's manual Lite mode choice on this device across rooms/sessions. */
const LITE_MODE_STORAGE_KEY = "gv:hostLiteMode";

/**
 * Reduced encoder ceiling for hosts publishing from a hot/low-power device. With no config
 * passed to LocalStageStream, the SDK defaults to STAGE_MAX_BITRATE (2500 Kbps) at
 * STAGE_MAX_FRAMERATE (30fps) for every host regardless of device - sustained 720p/30fps
 * WebRTC encode for a whole show is a well-known source of "my phone gets hot" complaints.
 * This caps both well below the max. It is an encoder-side cap only, independent of the
 * getUserMedia capture resolution, so it applies cleanly to the same camera track.
 */
const LITE_VIDEO_CONFIG: StageVideoConfiguration = { maxVideoBitrateKbps: 700, maxFramerate: 15 };

/**
 * Defaults Lite mode on for phones/tablets (the devices actually reporting heat issues),
 * remembering any explicit choice the seller has already made on this device first.
 */
function detectDefaultLiteMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(LITE_MODE_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /** Storage unavailable (private browsing, etc.) - fall through to device detection. */
  }
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

/** Builds the local camera/mic streams for publish, applying the Lite encoder cap to video only. */
function buildLocalStreams(
  ivs: Awaited<typeof import("amazon-ivs-web-broadcast")>,
  media: MediaStream,
  lite: boolean,
): LocalStageStream[] {
  const streams: LocalStageStream[] = [];
  const videoTrack = media.getVideoTracks()[0];
  const audioTrack = media.getAudioTracks()[0];
  if (videoTrack) streams.push(new ivs.LocalStageStream(videoTrack, lite ? LITE_VIDEO_CONFIG : undefined));
  if (audioTrack) streams.push(new ivs.LocalStageStream(audioTrack));
  return streams;
}

function mediaConstraints(videoDeviceId?: string, audioDeviceId?: string): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    // Keep host mic levels consistent for viewers (bare `audio: true` often captures quietly).
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (audioDeviceId) {
    audio.deviceId = { exact: audioDeviceId };
  }
  return {
    // No `facingMode` default: this console is desktop/PC-only, and `facingMode: "user"` is an
    // EXACT constraint per the getUserMedia spec when passed as a bare string. Most external/USB
    // webcams don't report any facingMode capability at all (that concept only really applies to
    // mobile front/back cameras), so requiring it made getUserMedia reject with
    // OverconstrainedError before the browser ever showed a permission prompt - sellers with an
    // external webcam got no camera/mic permission dialog at all. Falling back to just a
    // resolution hint lets the browser use whatever default camera is available.
    video: videoDeviceId
      ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio,
  };
}

/**
 * In-browser IVS Real-Time Stage publish for the seller command center.
 * Supports pre-live camera preview + device selection before Go live.
 */
export function useHostStagePublish({
  roomId,
  onBroadcastStarted,
  onStreamRefresh,
  onLive,
  autoPreview = true,
}: {
  roomId: string;
  onBroadcastStarted?: () => void | Promise<void>;
  onStreamRefresh?: () => void;
  onLive?: () => void;
  /** Start camera preview on mount when room is not yet broadcasting. */
  autoPreview?: boolean;
}) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const localStreamsRef = useRef<LocalStageStream[]>([]);
  const startInFlightRef = useRef(false);
  const wentLiveRef = useRef(false);
  const previewOnlyRef = useRef(false);
  const reconnectInFlightRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const intentionalStopRef = useRef(false);
  const tokenRefreshTimerRef = useRef<number | null>(null);
  const ivsModuleRef = useRef<Awaited<typeof import("amazon-ivs-web-broadcast")> | null>(null);
  const reconnectPublishRef = useRef<(trigger: string) => void>(() => {});
  const [phase, setPhase] = useState<HostBroadcastPhase>("idle");
  /** Publish / reconnect failures only — never set by preview so companion consoles stay clean. */
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<HostMediaDevices>({ video: [], audio: [] });
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [liteMode, setLiteModeState] = useState<boolean>(() => detectDefaultLiteMode());
  const liteModeRef = useRef(liteMode);
  liteModeRef.current = liteMode;

  const callbacksRef = useRef({ onBroadcastStarted, onStreamRefresh, onLive });
  callbacksRef.current = { onBroadcastStarted, onStreamRefresh, onLive };

  const stopMediaTracks = useCallback(() => {
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
    previewOnlyRef.current = false;
    setPreviewStream(null);
  }, []);

  const cleanupStage = useCallback(() => {
    if (tokenRefreshTimerRef.current != null) {
      window.clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    try {
      stageRef.current?.leave();
    } catch {
      /** ignore */
    }
    stageRef.current = null;
    localStreamsRef.current = [];
  }, []);

  const cleanupLocal = useCallback(() => {
    cleanupStage();
    stopMediaTracks();
  }, [cleanupStage, stopMediaTracks]);

  useEffect(() => () => cleanupLocal(), [cleanupLocal]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices({
      video: all.filter((d) => d.kind === "videoinput"),
      audio: all.filter((d) => d.kind === "audioinput"),
    });
  }, []);

  const acquireMedia = useCallback(
    async (opts?: { videoDeviceId?: string; audioDeviceId?: string; previewOnly?: boolean }) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support in-browser streaming. Use OBS / RTMP instead.");
      }
      stopMediaTracks();
      const videoId = opts?.videoDeviceId ?? selectedVideoDeviceId;
      const audioId = opts?.audioDeviceId ?? selectedAudioDeviceId;
      logIvsWeb("permission requested", { roomId, transport: "webrtc", preview: opts?.previewOnly ?? false });
      const media = await navigator.mediaDevices.getUserMedia(mediaConstraints(videoId || undefined, audioId || undefined));
      mediaStreamRef.current = media;
      previewOnlyRef.current = opts?.previewOnly ?? false;
      setPreviewStream(media);
      if (videoId) setSelectedVideoDeviceId(videoId);
      if (audioId) setSelectedAudioDeviceId(audioId);
      await refreshDevices();
      logIvsWeb("permission granted", {
        transport: "webrtc",
        videoTracks: media.getVideoTracks().length,
        audioTracks: media.getAudioTracks().length,
      });
      return media;
    },
    [refreshDevices, roomId, selectedAudioDeviceId, selectedVideoDeviceId, stopMediaTracks],
  );

  const startPreview = useCallback(async () => {
    if (stageRef.current) return;
    setPreviewError(null);
    try {
      await acquireMedia({ previewOnly: true });
      setPhase("preview");
    } catch (err) {
      setPhase("idle");
      setPreviewError(friendlyMediaError(err));
    }
  }, [acquireMedia]);

  const restartPreviewWithDevices = useCallback(
    async (videoDeviceId: string, audioDeviceId: string) => {
      if (stageRef.current) return;
      setSelectedVideoDeviceId(videoDeviceId);
      setSelectedAudioDeviceId(audioDeviceId);
      setPreviewError(null);
      try {
        await acquireMedia({ videoDeviceId, audioDeviceId, previewOnly: true });
        setPhase("preview");
      } catch (err) {
        setPreviewError(friendlyMediaError(err));
      }
    },
    [acquireMedia],
  );

  const releasePreview = useCallback(() => {
    if (stageRef.current || wentLiveRef.current) return;
    stopMediaTracks();
    setPreviewError(null);
    setPhase("idle");
  }, [stopMediaTracks]);

  useEffect(() => {
    if (!autoPreview) return;
    void startPreview();
  }, [autoPreview, roomId, startPreview]);

  const endServerSession = useCallback(async () => {
    try {
      await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      logIvsWeb("stage stop error", {
        roomId,
        message: err instanceof Error ? err.message : "stage_stop_failed",
      });
    }
  }, [roomId]);

  const refreshHostToken = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as StageTokenResponse;
    if (!res.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "Could not refresh the live broadcast.");
    }
    const token = body.stage?.token?.trim();
    if (!token) throw new Error("Stage credentials were incomplete.");
    return token;
  }, [roomId]);

  const joinPublishStage = useCallback(
    async (token: string, ivs: Awaited<typeof import("amazon-ivs-web-broadcast")>) => {
      const strategy: StageStrategy = {
        stageStreamsToPublish: () => localStreamsRef.current,
        shouldPublishParticipant: () => true,
        shouldSubscribeToParticipant: () => ivs.SubscribeType.NONE,
      };

      const stage = new ivs.Stage(token, strategy);
      stageRef.current = stage;

      stage.on(ivs.StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state: StageConnectionStateType) => {
        if (state === ivs.StageConnectionState.CONNECTED) {
          reconnectAttemptsRef.current = 0;
          if (!wentLiveRef.current) {
            wentLiveRef.current = true;
            setPhase("live");
            void callbacksRef.current.onBroadcastStarted?.();
            callbacksRef.current.onStreamRefresh?.();
            callbacksRef.current.onLive?.();
          }
          if (tokenRefreshTimerRef.current != null) window.clearTimeout(tokenRefreshTimerRef.current);
          tokenRefreshTimerRef.current = window.setTimeout(() => {
            if (!wentLiveRef.current || intentionalStopRef.current) return;
            reconnectPublishRef.current("token_refresh");
          }, HOST_TOKEN_REFRESH_MS);
          return;
        }
        if (
          (state === ivs.StageConnectionState.DISCONNECTED || state === ivs.StageConnectionState.ERRORED) &&
          wentLiveRef.current &&
          !intentionalStopRef.current
        ) {
          reconnectPublishRef.current(`connection_${state}`);
        }
      });

      stage.on(ivs.StageEvents.ERROR, (err: StageError) => {
        logIvsWeb("stage publish error", { roomId, message: err?.message, code: err?.code });
        if (wentLiveRef.current && !intentionalStopRef.current) {
          reconnectPublishRef.current(`stage_error_${err?.code ?? "unknown"}`);
        }
      });

      await stage.join();
    },
    [roomId],
  );

  const reconnectPublish = useCallback(
    async (trigger: string) => {
      if (reconnectInFlightRef.current || intentionalStopRef.current || !wentLiveRef.current) return;
      if (reconnectAttemptsRef.current >= HOST_MAX_REJOIN_ATTEMPTS) {
        setError("Live connection lost. End the show and go live again, or refresh the page.");
        return;
      }
      reconnectInFlightRef.current = true;
      reconnectAttemptsRef.current += 1;
      logIvsWeb("stage publish rejoin", { roomId, trigger, attempt: reconnectAttemptsRef.current });
      try {
        try {
          stageRef.current?.leave();
        } catch {
          /* ignore */
        }
        stageRef.current = null;
        const ivs = ivsModuleRef.current ?? (await import("amazon-ivs-web-broadcast"));
        ivsModuleRef.current = ivs;
        const token = await refreshHostToken();
        await joinPublishStage(token, ivs);
        callbacksRef.current.onStreamRefresh?.();
      } catch (err) {
        logIvsWeb("stage publish rejoin failed", {
          roomId,
          message: err instanceof Error ? err.message : "rejoin_failed",
        });
        if (reconnectAttemptsRef.current >= HOST_MAX_REJOIN_ATTEMPTS) {
          setError("Reconnecting to live…");
          setTimeout(() => {
            if (!intentionalStopRef.current && wentLiveRef.current) {
              reconnectAttemptsRef.current = 0;
              reconnectPublishRef.current("rejoin_loop");
            }
          }, 5_000);
        }
      } finally {
        reconnectInFlightRef.current = false;
      }
    },
    [joinPublishStage, refreshHostToken, roomId],
  );

  reconnectPublishRef.current = (trigger: string) => {
    void reconnectPublish(trigger);
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (wentLiveRef.current && !intentionalStopRef.current && phase === "live") {
        void reconnectPublish("visibility_resume");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, reconnectPublish]);

  const start = useCallback(async () => {
    if (startInFlightRef.current) return;
    if (stageRef.current) {
      // A Stage object can be left behind here without this hook ever reaching "live" - e.g.
      // stage.join() hangs or errors outside this function's own try/catch, or a race with
      // startPreview/releasePreview leaves stageRef set while phase reports idle/preview. Before
      // this fix that made start() refuse forever with zero feedback: no permission prompt, no
      // error, the camera simply never turned on and Go Live looked like it did nothing. Clear
      // the stale Stage and proceed instead of silently bailing.
      logIvsWeb("startBroadcast", { roomId, note: "clearing stale stage before restart", phase });
      cleanupStage();
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support in-browser streaming. Use OBS / RTMP instead.");
      return;
    }

    startInFlightRef.current = true;
    wentLiveRef.current = false;
    intentionalStopRef.current = false;
    reconnectAttemptsRef.current = 0;
    setPhase("starting");
    setError(null);

    try {
      let media = mediaStreamRef.current;
      if (!media || !previewOnlyRef.current) {
        media = await acquireMedia({ previewOnly: false });
      }
      previewOnlyRef.current = false;

      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as StageTokenResponse;
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not start the live broadcast.");
      }
      const token = body.stage?.token?.trim();
      if (!token) {
        throw new Error("Stage credentials were incomplete. Try again or use OBS / RTMP.");
      }

      const ivs = await import("amazon-ivs-web-broadcast");
      ivsModuleRef.current = ivs;
      localStreamsRef.current = buildLocalStreams(ivs, media, liteModeRef.current);

      await joinPublishStage(token, ivs);
    } catch (err) {
      cleanupStage();
      void endServerSession();
      setPhase(previewStream ? "preview" : "idle");
      setError(friendlyMediaError(err));
    } finally {
      startInFlightRef.current = false;
    }
  }, [acquireMedia, cleanupStage, endServerSession, joinPublishStage, phase, previewStream, roomId]);

  const stop = useCallback(async () => {
    intentionalStopRef.current = true;
    setPhase((prev) => (prev === "live" || prev === "starting" || prev === "paused" ? "stopping" : prev));
    if (!stageRef.current && phase !== "live" && phase !== "starting" && phase !== "paused") return;
    setError(null);
    cleanupStage();
    try {
      await endServerSession();
      callbacksRef.current.onStreamRefresh?.();
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      wentLiveRef.current = false;
      reconnectAttemptsRef.current = 0;
      previewOnlyRef.current = true;
      setPhase(mediaStreamRef.current ? "preview" : "idle");
    }
  }, [cleanupStage, endServerSession, phase]);

  const pause = useCallback(async () => {
    if (phase !== "live") return;
    const media = mediaStreamRef.current;
    for (const track of media?.getTracks() ?? []) {
      track.enabled = false;
    }
    setPhase("paused");
  }, [phase]);

  const resume = useCallback(async () => {
    if (phase !== "paused") return;
    const media = mediaStreamRef.current;
    for (const track of media?.getTracks() ?? []) {
      track.enabled = true;
    }
    setPhase("live");
  }, [phase]);

  /**
   * Toggles the publish encoder cap. Before Go Live this only sets the preference the next
   * `start()` will use. Once live/paused, it swaps in a freshly-configured LocalStageStream for
   * the same camera track and calls `stage.refreshStrategy()` - the SDK's documented way to
   * pick up a stageStreamsToPublish() change - so quality drops without leaving/rejoining the
   * Stage and with no visible interruption for buyers.
   */
  const setLiteMode = useCallback(
    (next: boolean) => {
      liteModeRef.current = next;
      setLiteModeState(next);
      try {
        window.localStorage.setItem(LITE_MODE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /** ignore */
      }
      const ivs = ivsModuleRef.current;
      const media = mediaStreamRef.current;
      if (!ivs || !media || !stageRef.current || !wentLiveRef.current) return;
      try {
        localStreamsRef.current = buildLocalStreams(ivs, media, next);
        stageRef.current.refreshStrategy();
        logIvsWeb("lite mode changed", { roomId, lite: next, live: true });
      } catch (err) {
        logIvsWeb("lite mode apply failed", {
          roomId,
          lite: next,
          message: err instanceof Error ? err.message : "refresh_failed",
        });
      }
    },
    [roomId],
  );

  return {
    phase,
    error,
    previewError,
    previewStream,
    devices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    setSelectedVideoDeviceId,
    setSelectedAudioDeviceId,
    liteMode,
    setLiteMode,
    refreshDevices,
    startPreview,
    restartPreviewWithDevices,
    releasePreview,
    start,
    stop,
    pause,
    resume,
  };
}
