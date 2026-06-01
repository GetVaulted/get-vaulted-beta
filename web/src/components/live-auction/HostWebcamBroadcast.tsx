"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AmazonIVSBroadcastClient } from "amazon-ivs-web-broadcast";

type BroadcastPhase = "idle" | "starting" | "live" | "stopping";

type BroadcastStartResponse = {
  error?: string;
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

export function HostWebcamBroadcast({
  roomId,
  compact = false,
  onStreamRefresh,
}: {
  roomId: string;
  compact?: boolean;
  onStreamRefresh?: () => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<AmazonIVSBroadcastClient | null>(null);
  const [phase, setPhase] = useState<BroadcastPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const startWebcam = useCallback(async () => {
    if (phase === "starting" || phase === "live") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support in-browser streaming. Use Advanced / OBS instead.");
      return;
    }

    setPhase("starting");
    setError(null);
    setNotice(null);

    try {
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

      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      mediaStreamRef.current = media;

      const ivs = await import("amazon-ivs-web-broadcast");
      const streamConfig = preset === "BASIC_LANDSCAPE" ? ivs.BASIC_LANDSCAPE : ivs.STANDARD_LANDSCAPE;
      const client = ivs.create({ streamConfig, ingestEndpoint });
      clientRef.current = client;

      await client.addVideoInputDevice(media, "camera", { index: 0 });
      await client.addAudioInputDevice(media, "microphone");

      const canvas = previewRef.current;
      if (canvas) client.attachPreview(canvas);

      const broadcastError = await client.startBroadcast(streamKey, ingestEndpoint);
      if (broadcastError) {
        throw new Error(broadcastError.message || "IVS rejected the broadcast.");
      }

      setPhase("live");
      setNotice("You are live from this browser. Buyers will see video once IVS reports a live signal (usually a few seconds).");
      onStreamRefresh?.();
    } catch (err) {
      cleanupLocal();
      setPhase("idle");
      setError(friendlyMediaError(err));
    }
  }, [cleanupLocal, onStreamRefresh, phase, roomId]);

  const stopWebcam = useCallback(async () => {
    if (phase !== "live" && phase !== "starting") return;
    setPhase("stopping");
    setError(null);
    setNotice(null);
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
      setNotice("Broadcast stopped. Stream key was rotated — start again to go live from the browser.");
      onStreamRefresh?.();
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      setPhase("idle");
    }
  }, [cleanupLocal, onStreamRefresh, phase, roomId]);

  const previewHeight = compact ? "h-36" : "h-48";

  return (
    <div className="rounded-lg border border-gold/20 bg-gold/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gold-bright/90">Go live with webcam</p>
        {phase === "live" ? (
          <span className="rounded-full border border-rose-500/35 bg-rose-950/40 px-2 py-0.5 text-[10px] font-semibold text-rose-100">
            Broadcasting
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        Stream directly from this browser using your camera and microphone. No OBS required.
      </p>

      <div className={`relative mt-3 overflow-hidden rounded-lg border border-white/10 bg-black ${previewHeight}`}>
        <canvas ref={previewRef} className="absolute inset-0 h-full w-full object-contain" />
        {phase === "idle" ? (
          <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-zinc-500">
            Camera preview appears when you go live.
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "live" || phase === "stopping" ? (
          <button
            type="button"
            disabled={phase === "stopping"}
            className="min-h-10 rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 text-xs font-bold text-rose-100 hover:bg-rose-950/50 disabled:opacity-40"
            onClick={() => void stopWebcam()}
          >
            {phase === "stopping" ? "Stopping…" : "Stop webcam broadcast"}
          </button>
        ) : (
          <button
            type="button"
            disabled={phase === "starting"}
            className="min-h-10 rounded-lg border border-gold/35 bg-gold/12 px-3 text-xs font-bold text-gold-bright hover:bg-gold/20 disabled:opacity-40"
            onClick={() => void startWebcam()}
          >
            {phase === "starting" ? "Starting camera…" : "Go live with webcam"}
          </button>
        )}
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">{notice}</p> : null}
    </div>
  );
}
