import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";

function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HostRecentSalesTile({ rows }: { rows: HostRecentSaleRowDTO[] }) {
  return (
    <div className="flex shrink-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950/75 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Recent sales</p>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
          {rows.length ? `${rows.length} shown` : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="shrink-0 py-2 text-center text-[11px] text-zinc-500">No payments on this show yet.</p>
      ) : (
        <ul className="space-y-1.5 pr-0.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-white/[0.06] bg-black/35 px-2.5 py-2 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-100">{r.itemTitle}</p>
                <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                  @{r.buyerUsername}
                  {r.spotLabel && r.spotLabel !== r.itemTitle ? ` · ${r.spotLabel}` : ""}
                </p>
                <p className="mt-0.5 font-mono tabular-nums text-zinc-300">{fmtUsd(r.amountUsd)}</p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                  r.paymentTone === "paid"
                    ? "border border-emerald-500/40 bg-emerald-950/45 text-emerald-200"
                    : r.paymentTone === "retry"
                      ? "border border-rose-500/45 bg-rose-950/40 text-rose-100"
                      : "border border-amber-500/35 bg-amber-950/35 text-amber-100"
                }`}
              >
                {r.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
