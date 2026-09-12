"use client";

import { useEffect, useRef } from "react";
import type {
  Stage,
  StageConnectionState as StageConnectionStateType,
  StageError,
  StageParticipantInfo,
  StageStream,
} from "amazon-ivs-web-broadcast";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";

/** If no remote media arrives within this window, fail over to HLS. */
const CONNECT_TIMEOUT_MS = 12_000;
/** Proactive token refresh before the 20-minute viewer TTL expires. */
const TOKEN_REFRESH_MS = 17 * 60 * 1000;
/** Max automatic WebRTC rejoin attempts before reporting failure to the player. */
const MAX_REJOIN_ATTEMPTS = 12;
/** No new video frames for this long while "connected" triggers a rejoin. */
const STALE_FRAME_MS = 8_000;
const STALE_CHECK_INTERVAL_MS = 3_000;

/** True when the browser can subscribe to a WebRTC Stage (RTCPeerConnection available). */
export function isWebRtcPlaybackSupported(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";
}

/** Client kill-switch — set NEXT_PUBLIC_LIVE_STAGE_ENABLED="false" to force HLS everywhere. */
export function isStageWebrtcEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_STAGE_ENABLED !== "false";
}

async function fetchViewerStageToken(roomId: string): Promise<string | null> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/stage-token`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { stage?: { token?: string } };
  return body.stage?.token?.trim() ?? null;
}

/**
 * Buyer-side WebRTC subscriber. When `active`, fetches a subscribe-only participant token, joins the
 * room's IVS Real-Time Stage, and attaches the host participant's remote tracks to `videoRef`.
 *
 * Automatically rejoins on mid-session disconnect, stale frames, and token expiry. After exhausting
 * retries it calls `onFailed` so the player can fall back to HLS.
 */
export function useStageSubscribe({
  roomId,
  videoRef,
  active,
  muted,
  refreshNonce,
  subscribeEpoch,
  onConnected,
  onFailed,
  onDisconnected,
}: {
  roomId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  muted: boolean;
  /** Bumped on stream_status / Supabase reconnect — forces a clean rejoin. */
  refreshNonce?: number;
  /** Bumped by the player on visibility resume or recoverable disconnect. */
  subscribeEpoch?: number;
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected?: () => void;
}) {
  const stageRef = useRef<Stage | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const cbRef = useRef({ onConnected, onFailed, onDisconnected });
  cbRef.current = { onConnected, onFailed, onDisconnected };

  useEffect(() => {
    const el = videoRef.current;
    if (el && streamRef.current && el.srcObject === streamRef.current) {
      el.muted = muted;
      el.volume = 1;
    }
  }, [muted, videoRef]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let connected = false;
    let connectTimeoutId: number | null = null;
    let tokenRefreshId: number | null = null;
    let staleCheckId: number | null = null;
    let lastFrameAt = Date.now();
    let lastVideoTime = -1;
    let lastVideoProgressAt = Date.now();
    let frameCallbackId: number | null = null;
    let rejoinAttempts = 0;
    let rejoinInFlight = false;

    const stream = new MediaStream();
    streamRef.current = stream;

    const clearTimers = () => {
      if (connectTimeoutId != null) {
        window.clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      if (tokenRefreshId != null) {
        window.clearTimeout(tokenRefreshId);
        tokenRefreshId = null;
      }
      if (staleCheckId != null) {
        window.clearInterval(staleCheckId);
        staleCheckId = null;
      }
      if (frameCallbackId != null && videoRef.current && "cancelVideoFrameCallback" in videoRef.current) {
        try {
          (videoRef.current as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(
            frameCallbackId,
          );
        } catch {
          /* ignore */
        }
        frameCallbackId = null;
      }
    };

    const attach = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = mutedRef.current;
      el.volume = 1;
      void el.play().catch(() => {
        /* autoplay may be blocked; the player's tap-for-sound UI handles it */
      });
    };

    const fail = (reason: string) => {
      if (cancelled) return;
      logIvsWeb("stage subscribe failed", { roomId, reason, rejoinAttempts });
      // #region agent log
      fetch("http://127.0.0.1:7674/ingest/20fcfd2c-15bc-4e11-921b-7cb9232e12f6", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "dca6d1" },
        body: JSON.stringify({
          sessionId: "dca6d1",
          hypothesisId: "H4",
          location: "useStageSubscribe.ts:fail",
          message: "buyer_stage_subscribe_failed",
          data: { roomId, reason, rejoinAttempts },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      cbRef.current.onFailed(reason);
    };

    const hasLiveVideoTrack = () =>
      stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);

    const scheduleTokenRefresh = () => {
      if (tokenRefreshId != null) window.clearTimeout(tokenRefreshId);
      tokenRefreshId = window.setTimeout(() => {
        if (cancelled || !connected) return;
        logIvsWeb("stage subscribe token refresh", { roomId });
        void attemptRejoin("token_refresh");
      }, TOKEN_REFRESH_MS);
    };

    const startStaleWatch = () => {
      const el = videoRef.current;
      lastFrameAt = Date.now();

      const onFrame = () => {
        if (cancelled || !connected) return;
        lastFrameAt = Date.now();
        if (el && "requestVideoFrameCallback" in el) {
          frameCallbackId = (el as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(
            onFrame,
          );
        }
      };

      if (el && "requestVideoFrameCallback" in el) {
        frameCallbackId = (el as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(
          onFrame,
        );
      }

      staleCheckId = window.setInterval(() => {
        if (cancelled || !connected) return;
        const tracks = stream.getVideoTracks();
        if (tracks.length === 0 || tracks.every((t) => t.readyState === "ended")) {
          void attemptRejoin("tracks_ended");
          return;
        }
        const el = videoRef.current;
        if (el && el.readyState >= 2 && Number.isFinite(el.currentTime)) {
          if (el.currentTime !== lastVideoTime) {
            lastVideoTime = el.currentTime;
            lastVideoProgressAt = Date.now();
            lastFrameAt = Date.now();
          } else if (Date.now() - lastVideoProgressAt > STALE_FRAME_MS) {
            void attemptRejoin("stale_playback");
            return;
          }
        }
        if ("requestVideoFrameCallback" in (el ?? {}) && Date.now() - lastFrameAt > STALE_FRAME_MS) {
          void attemptRejoin("stale_frames");
        }
      }, STALE_CHECK_INTERVAL_MS);
    };

    const teardownStage = async () => {
      clearTimers();
      connected = false;
      try {
        stageRef.current?.leave();
      } catch {
        /* ignore */
      }
      stageRef.current = null;
    };

    const attemptRejoin = async (trigger: string) => {
      if (cancelled || rejoinInFlight) return;
      if (rejoinAttempts >= MAX_REJOIN_ATTEMPTS) {
        fail(`rejoin_exhausted_${trigger}`);
        return;
      }
      rejoinAttempts += 1;
      rejoinInFlight = true;
      logIvsWeb("stage subscribe rejoin", { roomId, trigger, attempt: rejoinAttempts });
      // #region agent log
      fetch("http://127.0.0.1:7674/ingest/20fcfd2c-15bc-4e11-921b-7cb9232e12f6", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "dca6d1" },
        body: JSON.stringify({
          sessionId: "dca6d1",
          hypothesisId: "H4",
          location: "useStageSubscribe.ts:attemptRejoin",
          message: "buyer_stage_rejoin",
          data: { roomId, trigger, attempt: rejoinAttempts },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      try {
        cbRef.current.onDisconnected?.();
        await teardownStage();
        for (const track of stream.getTracks()) {
          try {
            stream.removeTrack(track);
          } catch {
            /* ignore */
          }
        }
        if (cancelled) return;
        lastVideoTime = -1;
        lastVideoProgressAt = Date.now();
        await joinStage();
      } finally {
        rejoinInFlight = false;
      }
    };

    const joinStage = async () => {
      if (cancelled) return;
      try {
        const token = await fetchViewerStageToken(roomId);
        if (!token) {
          fail("token_missing");
          return;
        }
        if (cancelled) return;

        const ivs = await import("amazon-ivs-web-broadcast");
        if (cancelled) return;

        const stage = new ivs.Stage(token, {
          stageStreamsToPublish: () => [],
          shouldPublishParticipant: () => false,
          shouldSubscribeToParticipant: (participant: StageParticipantInfo) =>
            participant.isLocal ? ivs.SubscribeType.NONE : ivs.SubscribeType.AUDIO_VIDEO,
        });
        stageRef.current = stage;

        stage.on(
          ivs.StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED,
          (participant: StageParticipantInfo, streams: StageStream[]) => {
            if (participant.isLocal || cancelled) return;
            for (const s of streams) {
              try {
                stream.addTrack(s.mediaStreamTrack);
              } catch {
                /* track may already be added */
              }
            }
            attach();
            if (!connected) {
              connected = true;
              rejoinAttempts = 0;
              if (connectTimeoutId != null) {
                window.clearTimeout(connectTimeoutId);
                connectTimeoutId = null;
              }
              logIvsWeb("stage subscribe connected", { roomId });
              cbRef.current.onConnected();
              scheduleTokenRefresh();
              startStaleWatch();
            }
          },
        );

        stage.on(
          ivs.StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED,
          (participant: StageParticipantInfo, streams: StageStream[]) => {
            if (participant.isLocal || cancelled) return;
            // #region agent log
            fetch("http://127.0.0.1:7674/ingest/20fcfd2c-15bc-4e11-921b-7cb9232e12f6", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "dca6d1" },
              body: JSON.stringify({
                sessionId: "dca6d1",
                hypothesisId: "H1",
                location: "useStageSubscribe.ts:STREAMS_REMOVED",
                message: "host_streams_removed",
                data: {
                  roomId,
                  streamCount: streams.length,
                  hadLiveVideo: hasLiveVideoTrack(),
                  connected,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            for (const s of streams) {
              try {
                stream.removeTrack(s.mediaStreamTrack);
              } catch {
                /* already removed */
              }
            }
            if (!hasLiveVideoTrack() && connected) {
              void attemptRejoin("streams_removed");
            }
          },
        );

        stage.on(ivs.StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state: StageConnectionStateType) => {
          logIvsWeb("stage subscribe state", { roomId, state });
          if (state === ivs.StageConnectionState.ERRORED) {
            void attemptRejoin("connection_errored");
            return;
          }
          if (state === ivs.StageConnectionState.DISCONNECTED && connected) {
            void attemptRejoin("connection_disconnected");
          }
        });

        stage.on(ivs.StageEvents.ERROR, (err: StageError) => {
          logIvsWeb("stage subscribe error", {
            roomId,
            name: err?.name,
            code: err?.code,
            category: err?.category,
            message: err?.message,
          });
          if (connected) {
            void attemptRejoin(`stage_error_${err?.code ?? "unknown"}`);
          } else {
            fail(`stage_error_${err?.code ?? "unknown"}`);
          }
        });

        await stage.join();
        if (cancelled) {
          await teardownStage();
          return;
        }
        connectTimeoutId = window.setTimeout(() => {
          if (!connected) void attemptRejoin("connect_timeout");
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        if (connected) {
          void attemptRejoin(err instanceof Error ? err.message : "subscribe_throw");
        } else {
          fail(err instanceof Error ? err.message : "subscribe_throw");
        }
      }
    };

    void joinStage();

    return () => {
      cancelled = true;
      clearTimers();
      void teardownStage();
      const el = videoRef.current;
      if (el && el.srcObject === streamRef.current) {
        el.srcObject = null;
      }
      for (const track of streamRef.current?.getTracks() ?? []) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current = null;
    };
  }, [active, roomId, videoRef, refreshNonce, subscribeEpoch]);
}
