"use client";

export type BuyerLiveQueueListItem = {
  id: string;
  displayTitle: string;
  metaLine: string;
};

export type BuyerLiveQueueListProps = {
  items: BuyerLiveQueueListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyTitle?: string;
  emptyHint?: string;
};

/** Scrollable buyer lineup list (sheet only — not seller host queue). */
export function BuyerLiveQueueList({
  items,
  selectedId,
  onSelect,
  emptyTitle = "Nothing in the lineup yet",
  emptyHint = "Items added by the host will appear here.",
}: BuyerLiveQueueListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-black/40 px-3 py-4 text-center">
        <p className="text-sm font-semibold text-zinc-300">{emptyTitle}</p>
        <p className="mt-1 text-xs text-zinc-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs transition ${
            item.id === selectedId
              ? "border-gold/45 bg-zinc-900 text-zinc-100"
              : "border-zinc-800 bg-black/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <p className="line-clamp-1 font-semibold">{item.displayTitle}</p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-300">{item.metaLine}</p>
        </button>
      ))}
    </div>
  );
}
