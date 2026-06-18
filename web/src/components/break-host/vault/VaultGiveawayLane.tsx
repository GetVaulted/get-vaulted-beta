"use client";

import type { LiveGiveawayDTO } from "@/lib/live-giveaway";
import { GiveawayTimerBadge } from "@/components/live-auction/GiveawayTimerBadge";

function statusLabel(status: LiveGiveawayDTO["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "entries_open":
      return "Entries open";
    case "entries_closed":
      return "Entries closed";
    case "drawn":
      return "Winner drawn";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

type VaultGiveawayLaneProps = {
  kind: "open" | "buyers";
  giveaways: LiveGiveawayDTO[];
  busy: boolean;
  lineup?: boolean;
  onAdd: () => void;
  onOpenEntries: (id: string) => void;
  onCloseEntries: (id: string) => void;
  onDraw: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onTimerExpired?: () => void;
};

export function VaultGiveawayLane({
  kind,
  giveaways,
  busy,
  lineup = false,
  onAdd,
  onOpenEntries,
  onCloseEntries,
  onDraw,
  onCancel,
  onDelete,
  onTimerExpired,
}: VaultGiveawayLaneProps) {
  const rows = giveaways.filter((g) => g.kind === kind);

  const addBtnClass = lineup
    ? "rounded-lg border border-emerald-400/25 bg-emerald-500/10 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/18"
    : "rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 py-2.5 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-400/20 hover:from-emerald-500/25";

  return (
    <div className={lineup ? "space-y-2" : "space-y-3"}>
      <button type="button" disabled={busy} onClick={onAdd} className={`w-full disabled:opacity-50 ${addBtnClass}`}>
        + Create {kind === "open" ? "giveaway" : "buyers giveaway"}
      </button>

      {kind === "buyers" ? (
        <p className="rounded-lg border border-zinc-800/80 bg-black/30 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
          Buyers enter automatically on purchase. AMOE link is generated in official rules only — not shown on stage.
          Entries run for 5 minutes; tap Draw anytime to pick early.
        </p>
      ) : (
        <p className="rounded-lg border border-zinc-800/80 bg-black/30 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
          Everyone in the room can enter while entries are open. Default 5-minute timer — draw anytime before it ends.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/40 px-3 py-6 text-center text-[11px] text-zinc-500">
          No {kind === "open" ? "giveaways" : "buyers giveaways"} yet.
        </p>
      ) : null}

      <div className={lineup ? "flex flex-col gap-1.5" : "space-y-2"}>
        {rows.map((g) => {
          const thumb = g.imageUrl?.trim();
          return (
            <div
              key={g.id}
              className={`rounded-xl border border-white/[0.06] bg-zinc-950/70 ${
                lineup ? "px-2.5 py-2" : "p-2.5"
              }`}
            >
              <div className="flex gap-2.5">
                <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-zinc-900/80">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="size-full object-cover opacity-90" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] font-black text-zinc-600">
                      {g.title.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-zinc-100">{g.title}</p>
                  {g.prizeDescription ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">{g.prizeDescription}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wide">
                    <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-zinc-400">
                      {statusLabel(g.status)}
                    </span>
                    <span className="rounded border border-emerald-400/15 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-100/90">
                      {g.entryCount} entries
                    </span>
                    {g.status === "entries_open" ? (
                      <GiveawayTimerBadge
                        entryCloseAt={g.entryCloseAt}
                        onExpired={onTimerExpired}
                        className="text-[9px] font-bold uppercase tracking-wide"
                      />
                    ) : null}
                  </div>
                  {g.status === "drawn" && g.winnerUsername ? (
                    <p className="mt-1 text-[10px] font-semibold text-amber-100/90">Winner @{g.winnerUsername}</p>
                  ) : null}
                  {kind === "buyers" && g.amoeRulesUrl ? (
                    <p className="mt-1 truncate text-[9px] text-zinc-600" title={g.amoeRulesUrl}>
                      AMOE: {g.amoeRulesUrl}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {g.status === "draft" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenEntries(g.id)}
                    className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-emerald-100"
                  >
                    Open entries
                  </button>
                ) : null}
                {g.status === "entries_open" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCloseEntries(g.id)}
                      className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDraw(g.id)}
                      className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-violet-100"
                    >
                      Draw
                    </button>
                  </>
                ) : null}
                {g.status === "entries_closed" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDraw(g.id)}
                    className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-violet-100"
                  >
                    Draw winner
                  </button>
                ) : null}
                {g.status !== "drawn" && g.status !== "cancelled" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancel(g.id)}
                    className="rounded-md px-2 py-1 text-[8px] font-semibold text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                ) : null}
                {g.status !== "drawn" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(g.id)}
                    className="rounded-md px-1.5 py-1 text-[8px] font-semibold text-zinc-600 hover:text-rose-300/90"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
