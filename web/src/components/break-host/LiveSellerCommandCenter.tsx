"use client";

import { useState, type ReactNode } from "react";
import { HostRecentSalesTile } from "@/components/break-host/HostRecentSalesTile";
import { LiveShowFeeTierTile } from "@/components/break-host/LiveShowFeeTierTile";
import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import { LiveHostRoomGovernance } from "@/components/trust/LiveHostRoomGovernance";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import { formatAuctionLeaderLine, formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import { liveAuctionDisplayBidUsd } from "@/lib/live-auction-overlay-price";
import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import type { LiveRoomModeratorRow } from "@/hooks/useLiveRoomModerationState";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type QueueTab = "auction" | "bin" | "givvy" | "sold";

export type LiveSellerCommandCenterProps = {
  roomTitle: string;
  roomStatus: string;
  viewerCount: number;
  streamTimerDisplay: string;
  connectionLabel: string;
  connectionOk: boolean;
  busy: boolean;
  overlayQueueRow: VaultQueueRow | null;
  activeBoardRow: VaultQueueRow | null;
  hostAuctionCountdownLabel: string | null;
  biddingWindowOpen: boolean;
  hostStartLiveAuctionEnabled: boolean;
  hostLiveItemAuctionBusy: boolean;
  onPatchRoom: (action: "start" | "end") => void;
  onStartAuction: () => void;
  onEndAuction: () => void;
  onPinSelected: () => void;
  onNextItem: () => void;
  queueTab: QueueTab;
  onQueueTab: (t: QueueTab) => void;
  queueRows: VaultQueueRow[];
  selectedQueueItemId: string;
  onSelectQueueItem: (id: string) => void;
  onPostItem: (id: string) => void;
  onSkipItem?: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddAuction: () => void;
  onOpenObs: () => void;
  onCopyPublic: () => void;
  recentSales: HostRecentSaleRowDTO[];
  feeTier?: LiveShowFeeTierSnapshot | null;
  roomGovernance?: {
    slowModeSeconds: number;
    moderators: LiveRoomModeratorRow[];
    busy: boolean;
    error: string | null;
    onSetSlowMode: (seconds: number) => void;
    onAssignModerator: (userId: string) => void;
    onRevokeModerator: (userId: string) => void;
  };
  /** Mobile: full-screen overlay with close button */
  variant?: "panel" | "overlay";
  onClose?: () => void;
};

function PrimaryBtn({
  children,
  onClick,
  disabled,
  tone = "gold",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gold" | "danger" | "ghost";
}) {
  const cls =
    tone === "danger"
      ? "border-rose-500/40 bg-rose-950/60 text-rose-100 hover:bg-rose-900/50"
      : tone === "ghost"
        ? "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
        : "border-amber-400/35 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-yellow-300/15 text-amber-50 hover:from-amber-500/35";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-[11px] font-black uppercase tracking-wide transition disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-300"
      >
        {title}
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-white/[0.06] px-3 py-3">{children}</div> : null}
    </div>
  );
}

function itemMoney(item: LiveRoomItemDTO) {
  return formatAuctionMoneyUsd(
    liveAuctionDisplayBidUsd({
      currentBidUsd: item.currentBidUsd,
      startingBidUsd: item.startingBidUsd,
      lastHighBidderId: item.lastHighBidderId,
      lastHighBidderUsername: item.lastHighBidderUsername,
    }),
  );
}

/** Simplified live seller command center — primary controls visible, rest tucked away. */
export function LiveSellerCommandCenter({
  roomTitle,
  roomStatus,
  viewerCount,
  streamTimerDisplay,
  connectionLabel,
  connectionOk,
  busy,
  overlayQueueRow,
  activeBoardRow,
  hostAuctionCountdownLabel,
  biddingWindowOpen,
  hostStartLiveAuctionEnabled,
  hostLiveItemAuctionBusy,
  onPatchRoom,
  onStartAuction,
  onEndAuction,
  onPinSelected,
  onNextItem,
  queueTab,
  onQueueTab,
  queueRows,
  selectedQueueItemId,
  onSelectQueueItem,
  onPostItem,
  onSkipItem,
  onDeleteItem,
  onAddAuction,
  onOpenObs,
  onCopyPublic,
  recentSales,
  feeTier,
  roomGovernance,
  variant = "panel",
  onClose,
}: LiveSellerCommandCenterProps) {
  const live = roomStatus === "live";
  const item = overlayQueueRow?.item ?? activeBoardRow?.item ?? null;
  const leaderLine = item
    ? formatAuctionLeaderLine({
        lastHighBidderUsername: item.lastHighBidderUsername,
        lastHighBidderId: item.lastHighBidderId,
        currentBidUsd: item.currentBidUsd,
        startingBidUsd: item.startingBidUsd,
        priceUsd: item.priceUsd,
      })
    : "No lot pinned";

  const shellClass =
    variant === "overlay"
      ? "flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950"
      : "flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950/95";

  return (
    <div className={shellClass}>
      {/* Top bar */}
      <header className="shrink-0 border-b border-white/[0.08] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{roomTitle}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  live ? "bg-emerald-500/15 text-emerald-200" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {live ? <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden /> : null}
                {live ? "Live" : roomStatus}
              </span>
              <span className="text-zinc-400">{viewerCount} viewers</span>
              <span className="text-zinc-500">{streamTimerDisplay}</span>
            </div>
          </div>
          {variant === "overlay" && onClose ? (
            <button type="button" onClick={onClose} className="rounded-lg border border-white/12 px-2 py-1 text-xs text-zinc-300">
              Close
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${connectionOk ? "text-emerald-300/90" : "text-amber-200/90"}`}>
            <span className={`size-1.5 rounded-full ${connectionOk ? "bg-emerald-400" : "bg-amber-400 motion-safe:animate-pulse"}`} aria-hidden />
            {connectionLabel}
          </span>
          <button
            type="button"
            disabled={busy || !live}
            onClick={() => onPatchRoom("end")}
            className="rounded-lg border border-rose-500/35 bg-rose-950/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-100 disabled:opacity-40"
          >
            End stream
          </button>
        </div>
        {!live ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatchRoom("start")}
            className="mt-2 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-100 disabled:opacity-40"
          >
            Go live
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* Active lot command block */}
        <section className="rounded-xl border border-white/10 bg-black/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">On the block</p>
          <p className="mt-1 line-clamp-2 text-sm font-bold text-white">{item?.title ?? "Pin a lot to begin"}</p>
          <p className="mt-2 font-mono text-2xl font-black tabular-nums text-amber-100">{item ? itemMoney(item) : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-zinc-300">{leaderLine}</p>
          {hostAuctionCountdownLabel && biddingWindowOpen ? (
            <p className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black tabular-nums text-emerald-100">
              {hostAuctionCountdownLabel}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryBtn
              onClick={onStartAuction}
              disabled={!hostStartLiveAuctionEnabled || hostLiveItemAuctionBusy || biddingWindowOpen}
            >
              {hostLiveItemAuctionBusy ? "Starting…" : "Start auction"}
            </PrimaryBtn>
            <PrimaryBtn onClick={onEndAuction} disabled={!item || busy} tone="ghost">
              End auction
            </PrimaryBtn>
            <PrimaryBtn onClick={onPinSelected} disabled={!selectedQueueItemId || busy}>
              Pin item
            </PrimaryBtn>
            <PrimaryBtn onClick={onNextItem} disabled={busy || !queueRows.some((r) => r.item.status === "queued")}>
              Next item
            </PrimaryBtn>
          </div>
        </section>

        {/* Queue */}
        <section className="mt-3">
          <VaultQueueCarousel
            tab={queueTab}
            onTab={onQueueTab}
            rows={queueRows}
            selectedId={selectedQueueItemId}
            onSelect={onSelectQueueItem}
            viewerCount={viewerCount}
            busy={busy}
            onPost={onPostItem}
            onSkip={onSkipItem}
            onDelete={onDeleteItem}
            onAddAuction={onAddAuction}
          />
        </section>

        {/* Secondary — collapsed by default */}
        <div className="mt-3 space-y-2">
          <CollapsibleSection title="More controls">
            <div className="grid grid-cols-2 gap-2">
              <PrimaryBtn onClick={onOpenObs} disabled={busy} tone="ghost">
                OBS setup
              </PrimaryBtn>
              <PrimaryBtn onClick={onCopyPublic} disabled={busy} tone="ghost">
                Copy show link
              </PrimaryBtn>
            </div>
            {roomGovernance ? (
              <div className="mt-3">
                <LiveHostRoomGovernance {...roomGovernance} />
              </div>
            ) : null}
          </CollapsibleSection>
          <CollapsibleSection title="Analytics">
            <div className="space-y-3">
              {feeTier ? <LiveShowFeeTierTile tier={feeTier} /> : null}
              <HostRecentSalesTile rows={recentSales} />
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
