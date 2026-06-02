"use client";

import { OBS_STUDIO, OBS_WIDGETS } from "@/lib/obs-studio-copy";
import { obsWidgetUrl } from "@/lib/obs-seller-paths";
import type { useObsWidgetToken } from "@/hooks/useObsWidgetToken";

type TokenState = ReturnType<typeof useObsWidgetToken>;

function prettyRotated(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export function ObsWidgetsPanel({
  roomId,
  tokenState,
  onCopy,
}: {
  roomId: string | null;
  tokenState: TokenState;
  onCopy: (message: string) => void;
}) {
  const { hasToken, rotatedAt, plainToken, loading, rotating, error, rotateToken } = tokenState;
  const activeToken = plainToken;

  const copyWidget = async (kind: (typeof OBS_WIDGETS)[number]["id"]) => {
    if (!roomId || !activeToken) {
      onCopy("Generate or rotate the widget token first.");
      return;
    }
    const url = obsWidgetUrl(kind, roomId, activeToken);
    try {
      await navigator.clipboard.writeText(url);
      onCopy(`${OBS_WIDGETS.find((w) => w.id === kind)?.label ?? "Widget"} URL copied.`);
    } catch {
      onCopy("Could not copy widget URL.");
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.widgets}</p>
          <p className="mt-1 text-sm text-zinc-400">{OBS_STUDIO.widgetHint}</p>
        </div>
        {roomId ? (
          <button
            type="button"
            disabled={rotating || loading}
            onClick={() => void rotateToken().then((t) => t && onCopy("New widget token issued — copy your URLs now."))}
            className="min-h-10 rounded-full border border-amber-500/30 bg-amber-950/30 px-4 text-xs font-bold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
          >
            {rotating
              ? "Rotating…"
              : hasToken
                ? OBS_STUDIO.rotateWidgetToken
                : OBS_STUDIO.generateWidgetToken}
          </button>
        ) : null}
      </div>

      {!roomId ? (
        <p className="mt-4 text-sm text-zinc-500">{OBS_STUDIO.selectShow}</p>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{OBS_STUDIO.widgetToken}</p>
            {loading ? (
              <p className="mt-2 text-sm text-zinc-500">Loading…</p>
            ) : activeToken ? (
              <>
                <p className="mt-2 break-all font-mono text-xs text-gold-bright">{activeToken}</p>
                <p className="mt-2 text-xs text-zinc-500">{OBS_STUDIO.widgetTokenHint}</p>
              </>
            ) : hasToken ? (
              <p className="mt-2 text-sm text-zinc-400">
                {OBS_STUDIO.widgetTokenActive}
                {prettyRotated(rotatedAt) ? ` · Last rotated ${prettyRotated(rotatedAt)}` : ""}. Rotate to reveal a new token and refresh widget URLs.
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">{OBS_STUDIO.widgetTokenMissing}</p>
            )}
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {OBS_WIDGETS.map((w) => {
              const previewUrl = activeToken && roomId ? obsWidgetUrl(w.id, roomId, activeToken) : null;
              return (
                <article key={w.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                  <h3 className="text-sm font-bold text-zinc-100">{w.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{w.description}</p>
                  <p className="mt-2 break-all font-mono text-[10px] text-zinc-600">
                    {previewUrl ?? "Generate token to copy URL"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!previewUrl}
                      onClick={() => void copyWidget(w.id)}
                      className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] font-bold text-gold-bright hover:bg-gold/15 disabled:opacity-40"
                    >
                      Copy URL
                    </button>
                    {previewUrl ? (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-white/12 px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.06]"
                      >
                        Preview
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
