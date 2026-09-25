"use client";

import { BreakSpotPayButton } from "@/components/live-auction/BreakSpotPayButton";
import type { LiveRoomBreakPublicDTO } from "@/lib/live-room-serialize";

const PHASE_LABEL: Record<LiveRoomBreakPublicDTO["phase"], string> = {
  not_started: "Not started",
  filling: "Filling",
  randomizing: "Randomizing",
  ready: "Ready",
  in_progress: "In progress",
  complete: "Complete",
};

const PHASE_TONE: Record<LiveRoomBreakPublicDTO["phase"], string> = {
  not_started: "border-zinc-700 bg-zinc-900/80 text-zinc-400",
  filling: "border-sky-500/35 bg-sky-950/40 text-sky-100",
  randomizing: "border-violet-500/40 bg-violet-950/35 text-violet-100",
  ready: "border-emerald-500/35 bg-emerald-950/30 text-emerald-100",
  in_progress: "border-amber-500/35 bg-amber-950/25 text-amber-100",
  complete: "border-zinc-600 bg-zinc-900/90 text-zinc-300",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  claimed: "Claimed",
  paid: "Paid",
  locked: "Locked",
  skipped: "Skipped",
};

const STATUS_BADGE: Record<string, string> = {
  available: "border-zinc-600 bg-zinc-900/80 text-zinc-400",
  claimed: "border-sky-500/30 bg-sky-950/30 text-sky-100",
  paid: "border-emerald-500/35 bg-emerald-950/35 text-emerald-100",
  locked: "border-amber-500/35 bg-amber-950/30 text-amber-100",
  skipped: "border-zinc-700 bg-black/50 text-zinc-500",
};

type BreakBuyerOverviewProps = {
  break: LiveRoomBreakPublicDTO;
  isLive: boolean;
  liveRoomId: string;
  currentUserId?: string | null;
};

export function BreakBuyerOverview({ break: b, isLive, liveRoomId, currentUserId }: BreakBuyerOverviewProps) {
  return (
    <div className="space-y-3">
      {(b.breakPaused || b.lockPurchases || b.breakFull) && isLive ? (
        <div className="flex flex-wrap gap-2">
          {b.breakPaused ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-[11px] font-semibold text-amber-100">
              Break paused — claims are paused until the host resumes.
            </div>
          ) : null}
          {b.lockPurchases ? (
            <div className="rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-[11px] font-semibold text-rose-100">
              Purchases locked — the host has temporarily disabled new claims.
            </div>
          ) : null}
          {b.breakFull ? (
            <div className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-[11px] font-semibold text-zinc-200">
              Break full — this break is closed to new spots.
            </div>
          ) : null}
        </div>
      ) : null}

      {b.randomization ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/90">Team assignments</p>
            {b.randomization.locked ? (
              <span className="rounded border border-emerald-500/40 bg-emerald-900/40 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-100">
                Final
              </span>
            ) : null}
          </div>
          {b.randomization.confirmedAt ? (
            <p className="mt-1 text-[10px] text-zinc-500">
              Confirmed {new Date(b.randomization.confirmedAt).toLocaleString()}
              {b.randomization.seed ? (
                <>
                  {" "}
                  · seed <span className="font-mono text-zinc-400">{b.randomization.seed}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {b.randomization.assignments.length > 0 ? (
            <ol className="mt-2 grid max-h-40 gap-1 overflow-y-auto text-[11px] sm:grid-cols-2">
              {b.randomization.assignments.map((a) => (
                <li key={`${a.order}-${a.label}`} className="flex items-baseline gap-2 rounded border border-white/[0.06] bg-black/40 px-2 py-1">
                  <span className="font-mono text-zinc-500">#{a.order}</span>
                  <span className="text-zinc-200">{a.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-500">No assignment rows in the saved result.</p>
          )}
        </div>
      ) : null}

      <div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {b.queueSpots.map((row) => (
            <div key={row.liveRoomItemId} className="rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-2">
              <p className="line-clamp-2 text-xs font-semibold text-zinc-100">{row.label}</p>
              <p className="mt-1 text-[10px] text-zinc-500">
                {row.quantity > 1 ? (
                  <span className="text-zinc-400">
                    {row.unitsClaimed}/{row.quantity} claimed
                    {row.buyerUsername ? (
                      <>
                        {" "}
                        · <span className="text-zinc-200">@{row.buyerUsername}</span>
                        {row.unitsClaimed > 1 ? " …" : ""}
                      </>
                    ) : null}
                  </span>
                ) : row.buyerUsername ? (
                  <span className="text-zinc-200">@{row.buyerUsername}</span>
                ) : (
                  <span>Available</span>
                )}
              </p>
              <p className="mt-1">
                <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_BADGE[row.displayStatus] ?? ""}`}>
                  {STATUS_LABEL[row.displayStatus] ?? row.displayStatus}
                </span>
              </p>
              {currentUserId
                ? row.spotClaims
                    .filter(
                      (c) =>
                        c.buyerUserId === currentUserId &&
                        c.displayStatus === "claimed" &&
                        c.breakPaymentStatus !== "paid" &&
                        c.breakPaymentStatus !== "locked",
                    )
                    .map((c) => (
                      <BreakSpotPayButton
                        key={c.claimId}
                        liveRoomId={liveRoomId}
                        breakSpotId={c.claimId}
                        disabled={!isLive}
                      />
                    ))
                : null}
            </div>
          ))}
        </div>
        {b.orphanSpots.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase text-zinc-500">Additional spots</p>
            <ul className="mt-1 space-y-1 text-[11px]">
              {b.orphanSpots.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.06] bg-black/30 px-2 py-1">
                  <span className="text-zinc-200">{o.spotLabel}</span>
                  <span className="text-zinc-400">@{o.buyerUsername}</span>
                  <span className={`rounded border px-1.5 text-[9px] font-bold uppercase ${STATUS_BADGE[o.displayStatus]}`}>
                    {STATUS_LABEL[o.displayStatus]}
                  </span>
                  {o.needsPayment && currentUserId && o.buyerUserId === currentUserId ? (
                    <BreakSpotPayButton liveRoomId={liveRoomId} breakSpotId={o.id} disabled={!isLive} />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {b.hits.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Hit feed</p>
          <ul className="mt-2 space-y-2">
            {b.hits.slice(0, 20).map((h) => (
              <li key={h.id} className="border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                <p className="text-xs font-semibold text-zinc-100">{h.title}</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {h.spotLabel ? <span className="text-zinc-400">{h.spotLabel}</span> : null}
                  {h.spotLabel && h.buyerUsername ? <span className="text-zinc-600"> · </span> : null}
                  {h.buyerUsername ? <span className="text-zinc-300">@{h.buyerUsername}</span> : null}
                  <span className="ml-2 text-zinc-600">{new Date(h.createdAt).toLocaleTimeString()}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
