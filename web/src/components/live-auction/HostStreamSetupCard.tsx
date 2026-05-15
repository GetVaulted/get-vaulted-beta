"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StreamPayload = {
  roomId: string;
  streamProvider: string;
  streamHealth: string;
  playbackUrl: string | null;
  streamStartedAt: string | null;
  streamEndedAt: string | null;
  lastStatusSyncAt: string | null;
  ingestEndpoint?: string | null;
};

function prettyDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function healthLabel(v: string) {
  switch ((v || "").toLowerCase()) {
    case "live":
      return "Live";
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting";
    case "ended":
      return "Ended";
    case "not_provisioned":
      return "Not set up";
    default:
      return "Unknown";
  }
}

function friendlyStreamError(message: string) {
  if (message.toLowerCase().includes("not configured")) {
    return "Streaming is not configured yet. Add AWS IVS environment values, then try again.";
  }
  return message;
}

export function HostStreamSetupCard({
  roomId,
  compact = false,
  realtimeRefreshNonce = 0,
}: {
  roomId: string;
  compact?: boolean;
  /** When incremented (e.g. room `stream_status` broadcast), refetches stream row from the server. */
  realtimeRefreshNonce?: number;
}) {
  const [stream, setStream] = useState<StreamPayload | null>(null);
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
    setBusyAction("refresh");
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream?sync=1`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        stream?: StreamPayload;
        viewerRole?: string;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not load stream status.");
        return;
      }
      if (j.viewerRole !== "host") {
        setError("Only the host can manage stream setup.");
        return;
      }
      setStream(j.stream ?? null);
    } catch {
      setError("Could not load stream status.");
    } finally {
      setBusyAction(null);
    }
  }, [roomId]);

  const callAction = useCallback(
    async (kind: "provision" | "rotate") => {
      setBusyAction(kind);
      setError(null);
      setNotice(null);
      setRevealKey(false);
      try {
        const path = kind === "provision" ? "provision" : "rotate-key";
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          stream?: StreamPayload;
          ingest?: { endpoint?: string; oneTimeStreamKey?: string };
          ok?: boolean;
        };
        if (!res.ok) {
          setError(friendlyStreamError(typeof j.error === "string" ? j.error : "Stream setup request failed."));
          return;
        }
        setStream(j.stream ?? null);
        const key = j.ingest?.oneTimeStreamKey ?? null;
        setOneTimeKey(key);
        setNotice(
          kind === "provision"
            ? "Stream setup complete. Copy the server and stream key into OBS, then Start Streaming."
            : "New stream key issued. Update OBS immediately — the old key no longer works and any running encode will disconnect.",
        );
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setBusyAction(null);
      }
    },
    [roomId],
  );

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadStream().finally(() => setLoading(false));
  }, [loadStream]);

  useEffect(() => {
    if (realtimeRefreshNonce < 1) return;
    void loadStream();
  }, [realtimeRefreshNonce, loadStream]);

  return (
    <section className={`rounded-xl border border-white/[0.08] bg-black/30 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Stream setup</h3>
        <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-zinc-300">
          {stream ? healthLabel(stream.streamHealth) : "Loading"}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        In <span className="font-semibold text-zinc-300">OBS</span>: Settings → Stream → Service <span className="font-semibold">Custom</span> → paste the{" "}
        <span className="font-semibold">server</span> and <span className="font-semibold">stream key</span> below. Then Settings → Output to set video bitrate, and start with{" "}
        <span className="font-semibold">Start Streaming</span>.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Buyers see the <span className="text-zinc-400">playback preview</span> only after IVS reports a live signal — it can take a few seconds after OBS starts. If status stays on
        Connecting, confirm OBS shows &quot;Streaming&quot; and click Refresh stream status.
      </p>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">RTMPS server</p>
          <p className="mt-1 break-all text-xs text-zinc-200">{stream?.ingestEndpoint || "Not set up yet"}</p>
          {stream?.ingestEndpoint ? (
            <button
              type="button"
              className="mt-2 min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => void copy(stream.ingestEndpoint!, "Server")}
            >
              Copy server
            </button>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Stream key</p>
          <p className="mt-1 break-all text-xs text-zinc-200">{maskedKey}</p>
          <p className="mt-1 text-[11px] text-amber-200/85">Keep this private. Anyone with this key can stream to your room.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!oneTimeKey}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
              onClick={() => setRevealKey((v) => !v)}
            >
              {revealKey ? "Hide key" : "Reveal key"}
            </button>
            <button
              type="button"
              disabled={!oneTimeKey}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
              onClick={() => (oneTimeKey ? void copy(oneTimeKey, "Stream key") : undefined)}
            >
              Copy key
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-2.5 text-xs text-zinc-300">
          <p>
            <span className="text-zinc-500">Playback status:</span> {stream ? healthLabel(stream.streamHealth) : "—"}
          </p>
          <p className="mt-1">
            <span className="text-zinc-500">Last sync:</span> {prettyDate(stream?.lastStatusSyncAt ?? null)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busyAction != null || loading}
          className="min-h-10 rounded-lg border border-gold/35 bg-gold/12 px-3 text-xs font-bold text-gold-bright hover:bg-gold/20 disabled:opacity-40"
          onClick={() => void callAction("provision")}
        >
          {busyAction === "provision" ? "Setting up…" : "Set up stream"}
        </button>
        <button
          type="button"
          disabled={busyAction != null || loading}
          className="min-h-10 rounded-lg border border-amber-500/25 px-3 text-xs font-semibold text-amber-100/95 hover:bg-amber-500/10 disabled:opacity-40"
          onClick={() => void callAction("rotate")}
          title="Creates a new key; OBS must be updated or the stream will fail."
        >
          {busyAction === "rotate" ? "Rotating…" : "Rotate stream key"}
        </button>
        <button
          type="button"
          disabled={busyAction != null || loading}
          className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
          onClick={() => void loadStream()}
        >
          {busyAction === "refresh" ? "Refreshing…" : "Refresh stream status"}
        </button>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">{notice}</p> : null}
    </section>
  );
}
