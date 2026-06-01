"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalStageStream,
  Stage,
  StageConnectionState as StageConnectionStateType,
  StageError,
  StageStrategy,
} from "amazon-ivs-web-broadcast";
import { logIvsWeb } from "@/lib/ivs-web-broadcast-log";

export type HostBroadcastPhase = "idle" | "starting" | "live" | "stopping";

type StageTokenResponse = {
  error?: string;
  stage?: {
    token?: string;
    participantId?: string;
    stageArn?: string;
    expiresInSeconds?: number;
  };
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
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not access camera or microphone.";
}

/**
 * Owns the in-browser IVS Real-Time (WebRTC Stage) publish session for the seller console.
 *
 * Replaces the legacy IVS channel/HLS webcam broadcast for browser/mobile Go Live: the host
 * publishes camera/mic into a Stage so buyers get sub-second WebRTC playback. Lives at the console
 * level (not inside a modal) so closing/collapsing UI does not tear down the running broadcast;
 * cleanup happens on host-console unmount or explicit stop.
 *
 * Keeps the same external surface (`phase`/`error`/`start`/`stop`) as the previous webcam hook so
 * the console wiring is unchanged.
 */
export function useHostStagePublish({
  roomId,
  onBroadcastStarted,
  onStreamRefresh,
  onLive,
}: {
  roomId: string;
  /** Called once the stage publish connects (e.g. mark room live). */
  onBroadcastStarted?: () => void | Promise<void>;
  /** Bump host stage + buyer playback refresh nonces. */
  onStreamRefresh?: () => void;
  /** Fired when the broadcast reaches the live phase. */
  onLive?: () => void;
}) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const localStreamsRef = useRef<LocalStageStream[]>([]);
  const startInFlightRef = useRef(false);
  const wentLiveRef = useRef(false);
  const [phase, setPhase] = useState<HostBroadcastPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const callbacksRef = useRef({ onBroadcastStarted, onStreamRefresh, onLive });
  callbacksRef.current = { onBroadcastStarted, onStreamRefresh, onLive };

  const cleanupLocal = useCallback(() => {
    try {
      stageRef.current?.leave();
    } catch {
      /** ignore */
    }
    stageRef.current = null;
    localStreamsRef.current = [];
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => () => cleanupLocal(), [cleanupLocal]);

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

  const start = useCallback(async () => {
    if (startInFlightRef.current || stageRef.current || mediaStreamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support in-browser streaming. Use Advanced / OBS instead.");
      logIvsWeb("stage publish error", { reason: "getUserMedia_unavailable" });
      return;
    }

    startInFlightRef.current = true;
    wentLiveRef.current = false;
    setPhase("starting");
    setError(null);

    try {
      logIvsWeb("permission requested", { roomId, transport: "webrtc" });
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      mediaStreamRef.current = media;
      logIvsWeb("permission granted", {
        transport: "webrtc",
        videoTracks: media.getVideoTracks().length,
        audioTracks: media.getAudioTracks().length,
      });

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
        throw new Error("Stage credentials were incomplete. Try again or use Advanced / OBS.");
      }
      logIvsWeb("stage token acquired", {
        roomId,
        httpStatus: res.status,
        participantId: body.stage?.participantId ?? "unknown",
      });

      const ivs = await import("amazon-ivs-web-broadcast");
      const videoTrack = media.getVideoTracks()[0];
      const audioTrack = media.getAudioTracks()[0];
      const localStreams: LocalStageStream[] = [];
      if (videoTrack) localStreams.push(new ivs.LocalStageStream(videoTrack));
      if (audioTrack) localStreams.push(new ivs.LocalStageStream(audioTrack));
      localStreamsRef.current = localStreams;

      // Single-host publish strategy: publish camera/mic, don't subscribe to anyone from the host.
      const strategy: StageStrategy = {
        stageStreamsToPublish: () => localStreamsRef.current,
        shouldPublishParticipant: () => true,
        shouldSubscribeToParticipant: () => ivs.SubscribeType.NONE,
      };

      const stage = new ivs.Stage(token, strategy);
      stageRef.current = stage;

      stage.on(ivs.StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state: StageConnectionStateType) => {
        logIvsWeb("stage connection state", { roomId, state });
        if (state === ivs.StageConnectionState.CONNECTED && !wentLiveRef.current) {
          wentLiveRef.current = true;
          setPhase("live");
          void callbacksRef.current.onBroadcastStarted?.();
          callbacksRef.current.onStreamRefresh?.();
          callbacksRef.current.onLive?.();
        }
      });
      stage.on(ivs.StageEvents.ERROR, (err: StageError) => {
        logIvsWeb("stage publish error", {
          roomId,
          source: "stage_error",
          name: err?.name,
          code: err?.code,
          category: err?.category,
          message: err?.message,
        });
      });

      await stage.join();
      logIvsWeb("stage join success", { roomId });
    } catch (err) {
      logIvsWeb("stage publish error", {
        roomId,
        source: "start_catch",
        message: err instanceof Error ? err.message : String(err),
      });
      cleanupLocal();
      void endServerSession();
      setPhase("idle");
      setError(friendlyMediaError(err));
    } finally {
      startInFlightRef.current = false;
    }
  }, [cleanupLocal, endServerSession, roomId]);

  const stop = useCallback(async () => {
    setPhase((prev) => (prev === "live" || prev === "starting" ? "stopping" : prev));
    if (!stageRef.current && !mediaStreamRef.current) return;
    setError(null);
    cleanupLocal();

    try {
      await endServerSession();
      callbacksRef.current.onStreamRefresh?.();
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      setPhase("idle");
    }
  }, [cleanupLocal, endServerSession]);

  return { phase, error, start, stop };
}
