"use client";

import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";
import type { LiveGiveawayDTO } from "@/lib/live-giveaway";
import { isGiveawayTab, type SellerQueueTab } from "@/lib/seller-queue-tabs";

type SellerConsoleInventoryRailProps = {
  tab: SellerQueueTab;
  onTab: (t: SellerQueueTab) => void;
  rows: VaultQueueRow[];
  giveaways: LiveGiveawayDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
  viewerCount: number;
  busy: boolean;
  onPost: (id: string) => void;
  onSkip?: (id: string) => void;
  onDelete: (id: string) => void;
  onAddItem: () => void;
  onAddGiveaway: () => void;
  onGiveawayOpenEntries: (id: string) => void;
  onGiveawayCloseEntries: (id: string) => void;
  onGiveawayDraw: (id: string) => void;
  onGiveawayCancel: (id: string) => void;
  onGiveawayDelete: (id: string) => void;
  onGiveawayTimerExpired?: () => void;
  onPinSelected: () => void;
  onNextItem: () => void;
  onStartAuction?: () => void;
  pinDisabled?: boolean;
  startAuctionEnabled?: boolean;
  startAuctionBusy?: boolean;
  roomLive?: boolean;
  hasActiveLot?: boolean;
};

export function SellerConsoleInventoryRail({
  tab,
  onTab,
  rows,
  giveaways,
  selectedId,
  onSelect,
  viewerCount,
  busy,
  onPost,
  onSkip,
  onDelete,
  onAddItem,
  onAddGiveaway,
  onGiveawayOpenEntries,
  onGiveawayCloseEntries,
  onGiveawayDraw,
  onGiveawayCancel,
  onGiveawayDelete,
  onGiveawayTimerExpired,
  onPinSelected,
  onNextItem,
  onStartAuction,
  pinDisabled,
  startAuctionEnabled = false,
  startAuctionBusy = false,
  roomLive = false,
  hasActiveLot = false,
}: SellerConsoleInventoryRailProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">{SELLER_CONSOLE.lineup}</p>
        <button
          type="button"
          onClick={isGiveawayTab(tab) ? onAddGiveaway : onAddItem}
          className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gold-bright hover:bg-gold/15"
        >
          + {isGiveawayTab(tab) ? "Giveaway" : SELLER_CONSOLE.addItem}
        </button>
      </div>
      <div className="shrink-0 space-y-2 px-3 py-2">
        {!hasActiveLot ? (
          <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-100/90">
            {roomLive
              ? "Select a lot in the lineup, then Pin lot to put it on the block."
              : "Add lots to the lineup, go live, then pin one to start auctioning."}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || pinDisabled}
            onClick={onPinSelected}
            className="flex-1 rounded-lg border border-violet-400/30 bg-violet-500/15 py-2 text-[10px] font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-500/22 disabled:opacity-40"
          >
            Pin lot
          </button>
          {onStartAuction ? (
            <button
              type="button"
              disabled={busy || !startAuctionEnabled || startAuctionBusy}
              onClick={onStartAuction}
              className="flex-1 rounded-lg border border-amber-300/35 bg-amber-500/20 py-2 text-[10px] font-bold uppercase tracking-wide text-amber-50 hover:bg-amber-500/28 disabled:opacity-40"
            >
              {startAuctionBusy ? "Starting…" : "Start auction"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onNextItem}
            className="flex-1 rounded-lg border border-white/12 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <VaultQueueCarousel
          tab={tab}
          onTab={onTab}
          rows={rows}
          giveaways={giveaways}
          selectedId={selectedId}
          onSelect={onSelect}
          viewerCount={viewerCount}
          busy={busy}
          onPost={onPost}
          onSkip={onSkip}
          onDelete={onDelete}
          onAddAuction={onAddItem}
          onAddGiveaway={onAddGiveaway}
          onGiveawayOpenEntries={onGiveawayOpenEntries}
          onGiveawayCloseEntries={onGiveawayCloseEntries}
          onGiveawayDraw={onGiveawayDraw}
          onGiveawayCancel={onGiveawayCancel}
          onGiveawayDelete={onGiveawayDelete}
          onGiveawayTimerExpired={onGiveawayTimerExpired}
          lineup
        />
      </div>
    </div>
  );
}
