"use client";

import { OBS_STUDIO } from "@/lib/obs-studio-copy";
import { obsConnectionLabel, obsReadyLabel } from "@/lib/obs-stream-health";
import type { useObsStreamSetup } from "@/hooks/useObsStreamSetup";

type StreamSetup = ReturnType<typeof useObsStreamSetup>;

export function ObsQuickSetupCard({
  setup,
  disabled,
}: {
  setup: StreamSetup;
  disabled: boolean;
}) {
  const busy = setup.busyAction != null || setup.loading;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.quickSetup}</p>
          <p className="mt-1 text-sm text-zinc-400">{OBS_STUDIO.detectObs}: IVS stream signal from your RTMP encode.</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
            setup.readyStatus === "ready"
              ? "border-emerald-500/35 bg-emerald-950/40 text-emerald-200"
              : setup.readyStatus === "connecting"
                ? "border-sky-500/30 bg-sky-950/30 text-sky-100"
                : "border-white/12 bg-black/40 text-zinc-300"
          }`}
        >
          {OBS_STUDIO.readyStatus}: {obsReadyLabel(setup.readyStatus)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{OBS_STUDIO.streamHealth}</p>
          <p className="mt-1 text-lg font-black text-zinc-100">{setup.healthLabel}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{OBS_STUDIO.connectionState}</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{obsConnectionLabel(setup.connectionState)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy || !setup.hasIngest}
          onClick={() => void setup.loadStream()}
          className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-bold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
        >
          {setup.busyAction === "refresh" ? "Refreshing…" : OBS_STUDIO.refreshStatus}
        </button>
        {!setup.hasIngest ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void setup.connectObs()}
            className="min-h-10 rounded-full bg-gradient-to-r from-gold/90 to-amber-300 px-5 text-xs font-black uppercase tracking-wide text-zinc-950 disabled:opacity-50"
          >
            {setup.busyAction === "provision" ? "Connecting…" : OBS_STUDIO.connectObs}
          </button>
        ) : setup.connectionState !== "live" ? (
          <p className="flex min-h-10 items-center text-xs text-zinc-400">
            Paste credentials below, then click <span className="mx-1 font-semibold text-zinc-200">Start Streaming</span> in OBS.
            Do not tap Go Live on the phone for an OBS show — Start Show here, then stream from OBS.
          </p>
        ) : (
          <p className="flex min-h-10 items-center text-xs font-semibold text-emerald-200">OBS signal detected — you are ready to sell.</p>
        )}
      </div>

      {setup.error ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{setup.error}</p>
      ) : null}
      {setup.notice ? (
        <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">{setup.notice}</p>
      ) : null}
    </section>
  );
}
