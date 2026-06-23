"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import { GiveawayTimerBadge } from "@/components/live-auction/GiveawayTimerBadge";

type Props = {
  liveRoomId: string;
  giveaways: ViewerGiveawayDTO[];
  signedIn: boolean;
  onRequireSignIn?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
};

/** Left-edge dark glass tab — Whatnot-style giveaway rail for buyers. */
export function LiveGiveawaySideTab({
  liveRoomId,
  giveaways,
  signedIn,
  onRequireSignIn,
  onEntered,
  onTimerExpired,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [enteredIds, setEnteredIds] = useState<Set<string>>(
    () => new Set(giveaways.filter((g) => g.viewerEntered).map((g) => g.id)),
  );
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => giveaways.filter((g) => g.kind === "open" && g.status === "entries_open"),
    [giveaways],
  );

  const primary = visible[0];
  const needsEntry = visible.some((g) => !g.viewerEntered && !enteredIds.has(g.id));
  const entryCount = primary?.entryCount ?? 0;

  useEffect(() => {
    if (visible.length === 0) setOpen(false);
  }, [visible.length]);

  const handleEnter = useCallback(
    async (giveawayId: string) => {
      if (!signedIn) {
        onRequireSignIn?.();
        return;
      }
      setBusyId(giveawayId);
      setError(null);
      try {
        const res = await fetch(
          `/api/live-rooms/${encodeURIComponent(liveRoomId)}/giveaways/${encodeURIComponent(giveawayId)}/enter`,
          { method: "POST" },
        );
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(j.error ?? "Could not enter giveaway.");
          return;
        }
        setEnteredIds((prev) => new Set([...prev, giveawayId]));
        onEntered?.();
      } catch {
        setError("Could not enter giveaway.");
      } finally {
        setBusyId(null);
      }
    },
    [liveRoomId, onEntered, onRequireSignIn, signedIn],
  );

  if (visible.length === 0 || !primary) return null;

  const entered = enteredIds.has(primary.id) || primary.viewerEntered;

  return (
    <div
      className="pointer-events-auto max-w-[min(20rem,calc(100vw-2rem))]"
      data-testid="live-giveaway-side-tab"
    >
      {!open ? (
        <button
          type="button"
          aria-label="Open giveaway"
          onClick={() => setOpen(true)}
          className={`relative flex min-h-[6rem] w-[3.65rem] shrink-0 flex-col justify-center gap-2 rounded-r-xl border border-l-0 border-white/15 bg-zinc-900/75 py-2.5 pl-2 pr-2 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.75)] backdrop-blur-md transition hover:bg-zinc-900/85 ${
            needsEntry ? "ring-1 ring-white/20" : ""
          }`}
        >
          <span className="text-left text-[11px] font-bold leading-tight tracking-tight text-zinc-50">
            Giveaway
          </span>
          <span className="flex items-center gap-1.5">
            <span className="relative inline-flex" aria-hidden>
              <span className="text-[19px] leading-none">🎁</span>
              {needsEntry ? (
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-white/90" />
              ) : null}
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[22px] font-extrabold leading-none tabular-nums text-zinc-50">
                {entryCount}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold text-zinc-300/80">Entries</span>
            </span>
          </span>
        </button>
      ) : (
        <div className="w-[min(18rem,calc(100vw-3rem))] rounded-xl border border-white/12 bg-zinc-900/88 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[15px] font-extrabold leading-snug tracking-tight text-zinc-50">
              {primary.title}
            </p>
            <button
              type="button"
              aria-label="Minimize giveaway"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 14h6v6M14 4h6v6M20 20l-6-6M4 4l6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {primary.prizeDescription ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{primary.prizeDescription}</p>
          ) : null}

          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold text-zinc-200/90">
            <span aria-hidden>🎁</span>
            <span>
              {entryCount} {entryCount === 1 ? "Entry" : "Entries"}
            </span>
            {primary.entryCloseAt ? (
              <GiveawayTimerBadge
                entryCloseAt={primary.entryCloseAt}
                onExpired={onTimerExpired}
                className="font-semibold normal-case tracking-normal text-zinc-400"
              />
            ) : null}
          </p>

          {entered ? (
            <p className="mt-3 rounded-full border border-white/15 bg-white/10 px-3 py-2.5 text-center text-xs font-bold text-zinc-100">
              {primary.viewerActiveInDrawing === false
                ? "Entered · return to stay in the drawing"
                : "You’re in the drawing"}
            </p>
          ) : (
            <button
              type="button"
              disabled={busyId === primary.id}
              onClick={() => void handleEnter(primary.id)}
              className="mt-3 flex w-full min-h-11 items-center justify-center rounded-full bg-zinc-50 px-4 py-2.5 text-sm font-extrabold text-zinc-900 transition hover:bg-white disabled:opacity-60"
            >
              {busyId === primary.id ? "…" : "Enter Giveaway"}
            </button>
          )}

          {error ? <p className="mt-2 text-center text-[11px] text-rose-300">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
