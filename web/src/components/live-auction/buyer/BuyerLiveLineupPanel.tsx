"use client";

import Link from "next/link";

export type BuyerLiveLineupRow = {
  id: string;
  displayTitle: string;
  metaLine: string;
};

export type BuyerLiveLineupPanelProps = {
  items: BuyerLiveLineupRow[];
  selectedId: string;
  previewCount?: number;
  shopHref?: string | null;
  onSelect: (id: string) => void;
  onViewAll: () => void;
};

/** Right-rail lineup — next 3–5 items only (desktop buyer). */
export function BuyerLiveLineupPanel({
  items,
  selectedId,
  previewCount = 5,
  shopHref,
  onSelect,
  onViewAll,
}: BuyerLiveLineupPanelProps) {
  const preview = items.slice(0, previewCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {preview.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-zinc-500">Nothing queued yet.</p>
        ) : (
          preview.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${
                item.id === selectedId
                  ? "border-gold/45 bg-zinc-900 text-zinc-100"
                  : "border-zinc-800/80 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <p className="line-clamp-1 text-[11px] font-semibold">{item.displayTitle}</p>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{item.metaLine}</p>
            </button>
          ))
        )}
      </div>
      {items.length > 0 ? (
        <div className="shrink-0 border-t border-zinc-800/80 p-2">
          <button
            type="button"
            onClick={onViewAll}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-[11px] font-bold text-zinc-100 transition hover:border-gold/40 hover:bg-zinc-800"
          >
            View full lineup ({items.length})
          </button>
        </div>
      ) : null}
    </div>
  );
}
