"use client";

import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";

type QueueTab = "auction" | "bin" | "givvy" | "sold";

type SellerConsoleInventoryRailProps = {
  tab: QueueTab;
  onTab: (t: QueueTab) => void;
  rows: VaultQueueRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  viewerCount: number;
  busy: boolean;
  onPost: (id: string) => void;
  onSkip?: (id: string) => void;
  onDelete: (id: string) => void;
  onAddItem: () => void;
  onPinSelected: () => void;
  onNextItem: () => void;
  pinDisabled?: boolean;
};

export function SellerConsoleInventoryRail({
  tab,
  onTab,
  rows,
  selectedId,
  onSelect,
  viewerCount,
  busy,
  onPost,
  onSkip,
  onDelete,
  onAddItem,
  onPinSelected,
  onNextItem,
  pinDisabled,
}: SellerConsoleInventoryRailProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">{SELLER_CONSOLE.lineup}</p>
        <button
          type="button"
          onClick={onAddItem}
          className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gold-bright hover:bg-gold/15"
        >
          + {SELLER_CONSOLE.addItem}
        </button>
      </div>
      <div className="flex shrink-0 gap-2 px-3 py-2">
        <button
          type="button"
          disabled={busy || pinDisabled}
          onClick={onPinSelected}
          className="flex-1 rounded-lg border border-white/12 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
        >
          Pin lot
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onNextItem}
          className="flex-1 rounded-lg border border-white/12 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
        >
          Next
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <VaultQueueCarousel
          tab={tab}
          onTab={onTab}
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
          viewerCount={viewerCount}
          busy={busy}
          onPost={onPost}
          onSkip={onSkip}
          onDelete={onDelete}
          onAddAuction={onAddItem}
          lineup
        />
      </div>
    </div>
  );
}
