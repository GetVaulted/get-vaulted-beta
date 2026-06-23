"use client";

import { useCallback, useState } from "react";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import { GiveawayTimerBadge } from "@/components/live-auction/GiveawayTimerBadge";

type LiveGiveawayEnterStripProps = {
  liveRoomId: string;
  giveaways: ViewerGiveawayDTO[];
  signedIn: boolean;
  onRequireSignIn?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
};

export function LiveGiveawayEnterStrip({
  liveRoomId,
  giveaways,
  signedIn,
  onRequireSignIn,
  onEntered,
  onTimerExpired,
}: LiveGiveawayEnterStripProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enteredIds, setEnteredIds] = useState<Set<string>>(
    () => new Set(giveaways.filter((g) => g.viewerEntered).map((g) => g.id)),
  );

  const visible = giveaways.filter((g) => g.kind === "open" && g.status === "entries_open");
  if (visible.length === 0) return null;

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

  return (
    <div className="space-y-2">
      {visible.map((g) => {
        const entered = enteredIds.has(g.id) || g.viewerEntered;
        return (
          <div
            key={g.id}
            className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 backdrop-blur-md"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-emerald-50">{g.title}</p>
              {g.prizeDescription ? (
                <p className="truncate text-[10px] text-emerald-100/70">{g.prizeDescription}</p>
              ) : null}
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200/60">
                {g.entryCount} entries
                {g.entryCloseAt ? (
                  <>
                    {" · "}
                    <GiveawayTimerBadge
                      entryCloseAt={g.entryCloseAt}
                      onExpired={onTimerExpired}
                      className="inline text-[9px] font-bold normal-case tracking-normal"
                    />
                  </>
                ) : null}
              </p>
            </div>
            {entered ? (
              <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100">
                {g.viewerActiveInDrawing === false ? "Entered · return to stay in" : "Entered"}
              </span>
            ) : (
              <button
                type="button"
                disabled={busyId === g.id}
                onClick={() => void handleEnter(g.id)}
                className="shrink-0 rounded-full bg-emerald-400 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-50"
              >
                {busyId === g.id ? "…" : "Enter"}
              </button>
            )}
          </div>
        );
      })}
      {error ? <p className="text-[10px] text-rose-300">{error}</p> : null}
    </div>
  );
}
