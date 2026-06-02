"use client";

import { useEffect, useRef } from "react";
import type { HostBroadcastPhase } from "@/hooks/useHostStagePublish";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";

type SellerGoLiveSetupPanelProps = {
  visible: boolean;
  phase: HostBroadcastPhase;
  error: string | null;
  previewStream: MediaStream | null;
  devices: { video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] };
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
  onVideoDevice: (id: string) => void;
  onAudioDevice: (id: string) => void;
  onObs: () => void;
  onGoLive: () => void;
  busy?: boolean;
};

export function SellerGoLiveSetupPanel({
  visible,
  phase,
  error,
  previewStream,
  devices,
  selectedVideoDeviceId,
  selectedAudioDeviceId,
  onVideoDevice,
  onAudioDevice,
  onObs,
  onGoLive,
  busy,
}: SellerGoLiveSetupPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = previewStream;
    if (previewStream) void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [previewStream]);

  if (!visible) return null;

  const starting = phase === "starting" || busy;

  return (
    <div className="pointer-events-auto absolute inset-x-4 top-20 z-20 mx-auto max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/90">{SELLER_CONSOLE.goLive}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{SELLER_CONSOLE.previewHint}</p>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black aspect-[9/16] max-h-[220px] w-full">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {!previewStream ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-zinc-500">Starting preview…</div>
        ) : null}
      </div>

      <label className="mt-3 block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{SELLER_CONSOLE.camera}</span>
        <select
          value={selectedVideoDeviceId}
          onChange={(e) => onVideoDevice(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-gold/40"
        >
          <option value="">Default camera</option>
          {devices.video.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-2 block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{SELLER_CONSOLE.microphone}</span>
        <select
          value={selectedAudioDeviceId}
          onChange={(e) => onAudioDevice(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-gold/40"
        >
          <option value="">Default microphone</option>
          {devices.audio.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={starting}
          onClick={onGoLive}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-gold/90 to-amber-300 px-4 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-50"
        >
          {starting ? "Starting…" : SELLER_CONSOLE.goLive}
        </button>
        <button
          type="button"
          onClick={onObs}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 text-xs font-bold uppercase tracking-wide text-zinc-200 hover:bg-white/[0.06]"
        >
          {SELLER_CONSOLE.obsSetup}
        </button>
      </div>
    </div>
  );
}
