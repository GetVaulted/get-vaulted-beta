"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AmazonIVSBroadcastClient } from "amazon-ivs-web-broadcast";
import { logIvsWeb, redactIngestEndpoint } from "@/lib/ivs-web-broadcast-log";

export type HostBroadcastPhase = "idle" | "starting" | "live" | "stopping";

type BroadcastStartResponse = {
  error?: string;
  stream?: {
    playbackUrl?: string | null;
    streamHealth?: string;
  };
  broadcast?: {
    ingestEndpoint?: string;
    streamKey?: string;
    streamConfigPreset?: "STANDARD_LANDSCAPE" | "BASIC_LANDSCAPE";
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Owns the in-browser IVS webcam broadcast (camera/mic → IVS) for the seller console.
 *
 * Lives at the console level (not inside the Start Stream modal) so that closing/collapsing
 * the modal after a successful start does NOT tear down the running broadcast. Cleanup only
 * happens when the host leaves the console (hook unmount).
 */
export function useHostWebcamBroadcast({
  roomId,
  onBroadcastStarted,
  onStreamRefresh,
  onLive,
}: {
  roomId: string;
  /** Called once the IVS broadcast starts successfully (e.g. mark room live). */
  onBroadcastStarted?: () => void | Promise<void>;
  /** Bump host stage HLS + buyer playback refresh nonces. */
  onStreamRefresh?: () => void;
  /** Fired when the broadcast reaches the live phase (e.g. auto-close the setup modal). */
  onLive?: () => void;
}) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<AmazonIVSBroadcastClient | null>(null);
  const startInFlightRef = useRef(false);
  const [phase, setPhase] = useState<HostBroadcastPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Keep callbacks in a ref so `start`/`stop` stay stable across console re-renders while
  // still invoking the latest handlers.
  const callbacksRef = useRef({ onBroadcastStarted, onStreamRefresh, onLive });
  callbacksRef.current = { onBroadcastStarted, onStreamRefresh, onLive };

  const cleanupLocal = useCallback(() => {
    try {
      clientRef.current?.stopBroadcast();
    } catch {
      /** ignore */
    }
    try {
      clientRef.current?.delete();
    } catch {
      /** ignore */
    }
    clientRef.current = null;
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => () => cleanupLocal(), [cleanupLocal]);

  const pollStreamHealth = useCallback(async () => {
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream?sync=1`, {
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          stream?: { streamHealth?: string; playbackUrl?: string | null };
        };
        const health = body.stream?.streamHealth ?? "unknown";
        const hasPlayback = Boolean(body.stream?.playbackUrl?.trim());
        logIvsWeb("stream health poll", { attempt, health, hasPlayback, httpStatus: res.status });
        if (health === "live") {
          // Stage + buyer playback should attach the moment IVS reports a live signal,
          // without waiting on the slower background poll.
          callbacksRef.current.onStreamRefresh?.();
          return;
        }
      } catch (pollErr) {
        logIvsWeb("stream health poll", {
          attempt,
          error: pollErr instanceof Error ? pollErr.message : "poll_failed",
        });
      }
      await sleep(2000);
    }
  }, [roomId]);

  const start = useCallback(async () => {
    if (startInFlightRef.current || clientRef.current || mediaStreamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support in-browser streaming. Use Advanced / OBS instead.");
      logIvsWeb("startBroadcast error", { reason: "getUserMedia_unavailable" });
      return;
    }

    startInFlightRef.current = true;
    setPhase("starting");
    setError(null);

    try {
      logIvsWeb("permission requested", { roomId });

      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      mediaStreamRef.current = media;

      logIvsWeb("permission granted", {
        videoTracks: media.getVideoTracks().length,
        audioTracks: media.getAudioTracks().length,
        videoEnabled: media.getVideoTracks()[0]?.enabled ?? false,
      });

      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/broadcast-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as BroadcastStartResponse;
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not start webcam broadcast.");
      }

      const ingestEndpoint = body.broadcast?.ingestEndpoint?.trim();
      const streamKey = body.broadcast?.streamKey?.trim();
      const preset = body.broadcast?.streamConfigPreset ?? "STANDARD_LANDSCAPE";
      if (!ingestEndpoint || !streamKey) {
        throw new Error("Stream credentials were incomplete. Try again or use Advanced / OBS.");
      }

      logIvsWeb("provision/broadcast-start success", {
        httpStatus: res.status,
        preset,
        ingestHost: redactIngestEndpoint(ingestEndpoint),
        hasPlaybackUrl: Boolean(body.stream?.playbackUrl?.trim()),
        streamHealth: body.stream?.streamHealth ?? "unknown",
      });

      const ivs = await import("amazon-ivs-web-broadcast");
      const streamConfig = preset === "BASIC_LANDSCAPE" ? ivs.BASIC_LANDSCAPE : ivs.STANDARD_LANDSCAPE;

      // Confirm the encoder settings the SDK preset will use. IVS web-broadcast presets fix the
      // keyframe interval (GOP) at ~2s, which is the recommended low-latency setting — there is no
      // long-GOP knob to misconfigure here. Logged so we can rule encoder settings in/out.
      const cfg = streamConfig as unknown as {
        maxResolution?: { width?: number; height?: number };
        maxFramerate?: number;
        maxBitrate?: number;
      };
      logIvsWeb("web broadcast preset config", {
        preset,
        maxWidth: cfg.maxResolution?.width ?? null,
        maxHeight: cfg.maxResolution?.height ?? null,
        maxFramerate: cfg.maxFramerate ?? null,
        maxBitrate: cfg.maxBitrate ?? null,
      });

      const client = ivs.create({ streamConfig, ingestEndpoint });
      clientRef.current = client;

      client.on(ivs.BroadcastClientEvents.CONNECTION_STATE_CHANGE, () => {
        logIvsWeb("sdk connection state", { state: client.getConnectionState() });
      });
      client.on(
        ivs.BroadcastClientEvents.ERROR,
        ((err: { name?: string; code?: number; message?: string }) => {
          logIvsWeb("startBroadcast error", {
            source: "sdk_clientError",
            name: err?.name,
            code: err?.code,
            message: err?.message,
          });
        }) as () => void,
      );

      await client.addVideoInputDevice(media, "camera", { index: 0 });
      await client.addAudioInputDevice(media, "microphone");

      logIvsWeb("startBroadcast called", { ingestHost: redactIngestEndpoint(ingestEndpoint) });

      let broadcastError: Awaited<ReturnType<typeof client.startBroadcast>> | undefined;
      try {
        broadcastError = await client.startBroadcast(streamKey, ingestEndpoint);
      } catch (startErr) {
        logIvsWeb("startBroadcast error", {
          source: "startBroadcast_throw",
          message: startErr instanceof Error ? startErr.message : String(startErr),
        });
        throw startErr;
      }

      if (broadcastError) {
        logIvsWeb("startBroadcast error", {
          source: "startBroadcast_return",
          name: broadcastError.name,
          code: broadcastError.code,
          message: broadcastError.message,
        });
        throw new Error(broadcastError.message || "IVS rejected the broadcast.");
      }

      logIvsWeb("startBroadcast success", { connectionState: client.getConnectionState?.() });

      setPhase("live");
      await callbacksRef.current.onBroadcastStarted?.();
      callbacksRef.current.onStreamRefresh?.();
      callbacksRef.current.onLive?.();
      void pollStreamHealth();
    } catch (err) {
      logIvsWeb("startBroadcast error", {
        source: "startWebcam_catch",
        message: err instanceof Error ? err.message : String(err),
      });
      cleanupLocal();
      setPhase("idle");
      setError(friendlyMediaError(err));
    } finally {
      startInFlightRef.current = false;
    }
  }, [cleanupLocal, pollStreamHealth, roomId]);

  const stop = useCallback(async () => {
    setPhase((prev) => (prev === "live" || prev === "starting" ? "stopping" : prev));
    if (!clientRef.current && !mediaStreamRef.current) return;
    setError(null);
    cleanupLocal();

    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/broadcast-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not stop webcam broadcast.");
      }
      callbacksRef.current.onStreamRefresh?.();
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      setPhase("idle");
    }
  }, [cleanupLocal, roomId]);

  return { phase, error, start, stop };
}
