"use client";

import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import type { LiveGiveawayDTO } from "@/lib/live-giveaway";
import type { SellerQueueTab } from "@/lib/seller-queue-tabs";

type VaultQueueDrawerProps = {
  open: boolean;
  onClose: () => void;
  tab: SellerQueueTab;
  onTab: (t: SellerQueueTab) => void;
  rows: VaultQueueRow[];
  giveaways?: LiveGiveawayDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
  viewerCount: number;
  busy: boolean;
  onPost: (id: string) => void;
  onSkip?: (id: string) => void;
  onDelete: (id: string) => void;
  onAddAuction: () => void;
  onAddGiveaway?: () => void;
  onGiveawayOpenEntries?: (id: string) => void;
  onGiveawayCloseEntries?: (id: string) => void;
  onGiveawayDraw?: (id: string) => void;
  onGiveawayCancel?: (id: string) => void;
  onGiveawayDelete?: (id: string) => void;
};

/** Floating lineup drawer — opens over the stage, not inside the left rail. */
export function VaultQueueDrawer({
  open,
  onClose,
  tab,
  onTab,
  rows,
  giveaways = [],
  selectedId,
  onSelect,
  viewerCount,
  busy,
  onPost,
  onSkip,
  onDelete,
  onAddAuction,
  onAddGiveaway,
  onGiveawayOpenEntries,
  onGiveawayCloseEntries,
  onGiveawayDraw,
  onGiveawayCancel,
  onGiveawayDelete,
}: VaultQueueDrawerProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[28] min-[1400px]:block hidden">
      <button
        type="button"
        aria-label="Close queue"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] motion-safe:animate-[live-stage-fade-in_0.25s_ease-out_both]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Show lineup"
        className="live-stage-queue-drawer absolute bottom-24 left-[min(240px,20vw)] top-16 z-10 flex w-[min(420px,38vw)] flex-col overflow-hidden motion-safe:animate-[live-stage-drawer-in_0.35s_var(--live-ease)_both]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">Lineup</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
            onAddAuction={onAddAuction}
            onAddGiveaway={onAddGiveaway}
            onGiveawayOpenEntries={onGiveawayOpenEntries}
            onGiveawayCloseEntries={onGiveawayCloseEntries}
            onGiveawayDraw={onGiveawayDraw}
            onGiveawayCancel={onGiveawayCancel}
            onGiveawayDelete={onGiveawayDelete}
            lineup
          />
        </div>
      </div>
    </div>
  );
}
