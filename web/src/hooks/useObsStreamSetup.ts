"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveObsConnectionState,
  deriveObsReadyStatus,
  streamHealthLabel,
} from "@/lib/obs-stream-health";

export type ObsStreamPayload = {
  roomId: string;
  streamHealth: string;
  ingestEndpoint?: string | null;
  lastStatusSyncAt: string | null;
  streamStartedAt: string | null;
};

export function useObsStreamSetup(roomId: string | null, roomStatus: string | null) {
  const [stream, setStream] = useState<ObsStreamPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<"provision" | "rotate" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);

  const maskedKey = useMemo(() => {
    if (!oneTimeKey) return "—";
    if (revealKey) return oneTimeKey;
    return `${"*".repeat(Math.max(12, oneTimeKey.length - 4))}${oneTimeKey.slice(-4)}`;
  }, [oneTimeKey, revealKey]);

  const loadStream = useCallback(async () => {
    if (!roomId) return;
    setBusyAction("refresh");
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream?sync=1`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        stream?: ObsStreamPayload;
        viewerRole?: string;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not load stream status.");
        return;
      }
      if (j.viewerRole !== "host") {
        setError("Only the host can manage stream settings.");
        return;
      }
      setStream(j.stream ?? null);
    } catch {
      setError("Could not load stream status.");
    } finally {
      setBusyAction(null);
    }
  }, [roomId]);

  const connectObs = useCallback(async () => {
    if (!roomId) return;
    setBusyAction("provision");
    setError(null);
    setNotice(null);
    setRevealKey(false);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        stream?: ObsStreamPayload;
        ingest?: { endpoint?: string; oneTimeStreamKey?: string };
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Stream setup failed.");
        return;
      }
      setStream(j.stream ?? null);
      setOneTimeKey(j.ingest?.oneTimeStreamKey ?? null);
      setNotice("Stream ready. Copy RTMPS URL and stream key into OBS, then Start Streaming.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }, [roomId]);

  const rotateKey = useCallback(async () => {
    if (!roomId) return;
    setBusyAction("rotate");
    setError(null);
    setNotice(null);
    setRevealKey(false);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/rotate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        stream?: ObsStreamPayload;
        ingest?: { oneTimeStreamKey?: string };
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not rotate stream key.");
        return;
      }
      setStream(j.stream ?? null);
      setOneTimeKey(j.ingest?.oneTimeStreamKey ?? null);
      setNotice("New stream key issued. Update OBS immediately.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }, [roomId]);

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }, []);

  useEffect(() => {
    if (!roomId) {
      setStream(null);
      setOneTimeKey(null);
      return;
    }
    setLoading(true);
    void loadStream().finally(() => setLoading(false));
    // Poll faster while waiting for OBS so ingest auto-start flips the show live quickly.
    const pollMs = roomStatus === "scheduled" ? 8_000 : 15_000;
    const poll = window.setInterval(() => void loadStream(), pollMs);
    return () => window.clearInterval(poll);
  }, [roomId, roomStatus, loadStream]);

  const hasIngest = Boolean(stream?.ingestEndpoint);
  const connectionState = deriveObsConnectionState(stream?.streamHealth, hasIngest);
  const readyStatus = deriveObsReadyStatus(stream?.streamHealth, hasIngest, roomStatus ?? "scheduled");
  const healthLabel = streamHealthLabel(stream?.streamHealth);

  return {
    stream,
    loading,
    busyAction,
    error,
    notice,
    oneTimeKey,
    revealKey,
    setRevealKey,
    maskedKey,
    loadStream,
    connectObs,
    rotateKey,
    copyText,
    connectionState,
    readyStatus,
    healthLabel,
    hasIngest,
  };
}
