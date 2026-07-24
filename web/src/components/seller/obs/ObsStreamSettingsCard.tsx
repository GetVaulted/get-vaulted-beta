"use client";

import { OBS_STUDIO } from "@/lib/obs-studio-copy";
import { obsConnectionLabel, streamHealthLabel } from "@/lib/obs-stream-health";
import type { useObsStreamSetup } from "@/hooks/useObsStreamSetup";

type StreamSetup = ReturnType<typeof useObsStreamSetup>;

function prettyDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function ObsStreamSettingsCard({
  setup,
  showTitle,
  disabled,
}: {
  setup: StreamSetup;
  showTitle: string | null;
  disabled: boolean;
}) {
  const busy = setup.busyAction != null || setup.loading;

  if (disabled) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.streamSettings}</p>
        <p className="mt-3 text-sm text-zinc-500">{OBS_STUDIO.selectShow}</p>
      </section>
    );
  }

  return (
    <section id="obs-stream-settings" className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.streamSettings}</p>
          {showTitle ? <p className="mt-1 text-sm font-semibold text-zinc-200">{showTitle}</p> : null}
        </div>
        <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-zinc-300">
          {streamHealthLabel(setup.stream?.streamHealth)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">RTMPS ingest URL</p>
          <p className="mt-1 break-all text-xs text-zinc-200">{setup.stream?.ingestEndpoint || "Not set up yet"}</p>
          {setup.stream?.ingestEndpoint ? (
            <button
              type="button"
              className="mt-2 min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => void setup.copyText(setup.stream!.ingestEndpoint!, "RTMPS URL")}
            >
              {OBS_STUDIO.copyServer}
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Stream key</p>
          <p className="mt-1 break-all text-xs text-zinc-200">{setup.maskedKey}</p>
          {setup.hasIngest && !setup.oneTimeKey ? (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">{OBS_STUDIO.keyMissingHint}</p>
          ) : (
            <p className="mt-1 text-[11px] text-amber-200/85">Private — anyone with this key can stream to your room.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!setup.oneTimeKey}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
              onClick={() => setup.setRevealKey((v) => !v)}
            >
              {setup.revealKey ? OBS_STUDIO.hideKey : OBS_STUDIO.revealKey}
            </button>
            <button
              type="button"
              disabled={!setup.oneTimeKey}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
              onClick={() => (setup.oneTimeKey ? void setup.copyText(setup.oneTimeKey, "Stream key") : undefined)}
            >
              {OBS_STUDIO.copyKey}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
        <p>
          <span className="text-zinc-500">{OBS_STUDIO.connectionState}:</span> {obsConnectionLabel(setup.connectionState)}
        </p>
        <p className="mt-1">
          <span className="text-zinc-500">{OBS_STUDIO.lastHeartbeat}:</span> {prettyDate(setup.stream?.lastStatusSyncAt ?? null)}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!setup.hasIngest ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setup.connectObs()}
            className="min-h-10 rounded-lg border border-gold/35 bg-gold/12 px-4 text-xs font-bold text-gold-bright hover:bg-gold/20 disabled:opacity-40"
          >
            {setup.busyAction === "provision" ? "Setting up…" : OBS_STUDIO.setupStream}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setup.rotateKey()}
            className="min-h-10 rounded-lg border border-amber-500/25 px-4 text-xs font-semibold text-amber-100/95 hover:bg-amber-500/10 disabled:opacity-40"
          >
            {setup.busyAction === "rotate" ? "Rotating…" : OBS_STUDIO.rotateKey}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void setup.loadStream()}
          className="min-h-10 rounded-lg border border-white/15 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
        >
          {setup.busyAction === "refresh" ? "Refreshing…" : OBS_STUDIO.refreshStatus}
        </button>
      </div>
    </section>
  );
}
