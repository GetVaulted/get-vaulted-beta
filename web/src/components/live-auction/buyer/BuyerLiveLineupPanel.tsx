"use client";

import Link from "next/link";

export type BuyerLiveLineupRow = {
  id: string;
  displayTitle: string;
  metaLine: string;
  /** When false, row is display-only (PYT/PYD/buy-now). Auction lots allow pre-bid selection. */
  selectable?: boolean;
};

export type BuyerLiveLineupPanelProps = {
  items: BuyerLiveLineupRow[];
  selectedId: string;
  shopHref?: string | null;
  onSelect: (id: string) => void;
  hideHeader?: boolean;
};

/** Right-rail item queue — compact, fully scrollable (desktop buyer). */
export function BuyerLiveLineupPanel({
  items,
  selectedId,
  shopHref,
  onSelect,
  hideHeader = false,
}: BuyerLiveLineupPanelProps) {

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideHeader ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lineup</p>
            <p className="text-[11px] font-semibold text-zinc-300">{items.length} items</p>
          </div>
          {shopHref ? (
            <Link href={shopHref} className="text-[10px] font-semibold text-gold-bright hover:underline">
              Shop →
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-zinc-500">Nothing queued yet.</p>
        ) : (
          items.map((item) => {
            const selected = item.id === selectedId;
            const selectable = item.selectable !== false;
            const rowClass = `w-full rounded-lg border px-2 py-1.5 text-left transition ${
              selected
                ? "border-gold/45 bg-zinc-900 text-zinc-100"
                : "border-zinc-800/80 bg-black/40 text-zinc-400"
            } ${selectable ? "hover:border-zinc-700 hover:text-zinc-200 cursor-pointer" : "cursor-default opacity-95"}`;
            const body = (
              <>
                <p className="line-clamp-1 text-[11px] font-semibold">{item.displayTitle}</p>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{item.metaLine}</p>
              </>
            );
            if (!selectable) {
              return (
                <div key={item.id} className={rowClass} aria-current={selected ? "true" : undefined}>
                  {body}
                </div>
              );
            }
            return (
              <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={rowClass}>
                {body}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
