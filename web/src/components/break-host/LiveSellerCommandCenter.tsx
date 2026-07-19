"use client";

import { useState, type ReactNode } from "react";
import { HostRecentSalesTile } from "@/components/break-host/HostRecentSalesTile";
import { LiveShowFeeTierTile } from "@/components/break-host/LiveShowFeeTierTile";
import { LiveShowSalesTile } from "@/components/break-host/LiveShowSalesTile";
import type { LiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary";
import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import { LiveHostRoomGovernance } from "@/components/trust/LiveHostRoomGovernance";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import { formatAuctionLeaderLine, formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import { liveAuctionDisplayBidUsd } from "@/lib/live-auction-overlay-price";
import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import type { LiveRoomModeratorRow } from "@/hooks/useLiveRoomModerationState";
import type { LiveGiveawayDTO } from "@/lib/live-giveaway";
import type { SellerQueueTab } from "@/lib/seller-queue-tabs";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantPurchaseItem, summarizeVariantSpots } from "@/lib/live-item-variant-presets";
import { HOST_PIN_BLOCKED_AUCTION_LIVE_MSG } from "@/lib/host-queue-selection";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import { VAULT_MODE_META } from "@/components/break-host/vault/vault-modes";
import { LiveRoomEnergyMeter } from "@/components/live-stage/LiveRoomEnergyMeter";
import { LiveShowShippingPanel } from "@/components/break-host/LiveShowShippingPanel";
import { computeLiveRoomEnergy } from "@/lib/live-room-energy";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";

type QueueTab = SellerQueueTab;

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
  /** Queue selection for edit/preview — not live for buyers until pinned active. */
  previewQueueRow?: VaultQueueRow | null;
  overlayDiffersFromActive?: boolean;
  hostAuctionCountdownLabel: string | null;
  biddingWindowOpen: boolean;
  hostStartLiveAuctionEnabled: boolean;
  hostLiveItemAuctionBusy: boolean;
  hostPinLotEnabled?: boolean;
  onPatchRoom: (action: "start" | "end") => void;
  onStartAuction: () => void;
  onEndAuction: () => void;
  onPinSelected: () => void;
  onNextItem: () => void;
  queueTab: QueueTab;
  onQueueTab: (t: QueueTab) => void;
  queueRows: VaultQueueRow[];
  giveaways?: LiveGiveawayDTO[];
  selectedQueueItemId: string;
  onSelectQueueItem: (id: string) => void;
  onPostItem: (id: string) => void;
  onSkipItem?: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddAuction: () => void;
  onAddGiveaway?: () => void;
  onGiveawayOpenEntries?: (id: string) => void;
  onGiveawayCloseEntries?: (id: string) => void;
  onGiveawayDraw?: (id: string) => void;
  onGiveawayCancel?: (id: string) => void;
  onGiveawayDelete?: (id: string) => void;
  onOpenObs: () => void;
  /** Go Live: patch room live AND auto-start the default webcam broadcast (no Tools required). */
  onGoLive: () => void;
  onToggleTeamBoard?: () => void;
  teamBoardPanelOpen?: boolean;
  onCopyPublic: () => void;
  recentSales: HostRecentSaleRowDTO[];
  feeTier?: LiveShowFeeTierSnapshot | null;
  sellerSummary?: LiveShowSellerSummaryDTO | null;
  sellerSummaryLoading?: boolean;
  sellerSummaryRefreshError?: boolean;
  vaultMode?: VaultMode;
  onVaultModeChange?: (mode: VaultMode) => void;
  roomEnergyScore?: number;
  roomEnergyLevel?: LiveRoomEnergyLevel;
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
  /** Desktop floating rail — ultra-compact utility dock */
  compactRail?: boolean;
  onOpenQueueDrawer?: () => void;
  queueDrawerOpen?: boolean;
  uiDimmed?: boolean;
  onClose?: () => void;
  liveRoomId?: string;
};

function PrimaryBtn({
  children,
  onClick,
  disabled,
  tone = "gold",
  compact = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gold" | "danger" | "ghost";
  compact?: boolean;
}) {
  const cls =
    tone === "danger"
      ? "border-rose-500/45 bg-rose-950/75 text-rose-50 hover:bg-rose-900/60"
      : tone === "ghost"
        ? "border-white/18 bg-black/50 text-zinc-100 hover:bg-black/65"
        : "border-amber-300/40 bg-gradient-to-r from-amber-500/30 via-amber-400/25 to-yellow-300/20 text-amber-50 hover:from-amber-500/40";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${compact ? "min-h-[36px] rounded-lg px-2.5 py-1.5 text-[10px]" : "min-h-[44px] rounded-xl px-3 py-2.5 text-[11px]"} border font-black uppercase tracking-wide transition disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  glass = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  glass?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={glass ? "live-stage-glass-tray overflow-hidden" : "rounded-xl border border-white/[0.08] bg-black/30"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between text-left text-[10px] font-bold uppercase tracking-wide text-zinc-300 ${glass ? "px-2.5 py-2" : "px-3 py-2.5"}`}
      >
        {title}
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className={`border-t border-white/[0.06] ${glass ? "px-2.5 py-2" : "px-3 py-3"}`}>{children}</div> : null}
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
  previewQueueRow = null,
  overlayDiffersFromActive = false,
  hostAuctionCountdownLabel,
  biddingWindowOpen,
  hostStartLiveAuctionEnabled,
  hostLiveItemAuctionBusy,
  hostPinLotEnabled = true,
  onPatchRoom,
  onStartAuction,
  onEndAuction,
  onPinSelected,
  onNextItem,
  queueTab,
  onQueueTab,
  queueRows,
  giveaways = [],
  selectedQueueItemId,
  onSelectQueueItem,
  onPostItem,
  onSkipItem,
  onDeleteItem,
  onAddAuction,
  onAddGiveaway,
  onGiveawayOpenEntries,
  onGiveawayCloseEntries,
  onGiveawayDraw,
  onGiveawayCancel,
  onGiveawayDelete,
  onOpenObs,
  onGoLive,
  onToggleTeamBoard,
  teamBoardPanelOpen = false,
  onCopyPublic,
  recentSales,
  feeTier,
  sellerSummary,
  sellerSummaryLoading,
  sellerSummaryRefreshError,
  vaultMode = "auction_night",
  onVaultModeChange,
  roomEnergyScore,
  roomEnergyLevel,
  roomGovernance,
  variant = "panel",
  compactRail = false,
  onOpenQueueDrawer,
  queueDrawerOpen = false,
  uiDimmed = false,
  onClose,
  liveRoomId,
}: LiveSellerCommandCenterProps) {
  const live = roomStatus === "live";
  const item = activeBoardRow?.item ?? null;
  const previewItem = previewQueueRow?.item ?? null;
  const commerceItem = item;
  const isVariantItem = isVariantPurchaseItem(commerceItem);
  const spotStats = isVariantItem ? summarizeVariantSpots(commerceItem?.variants) : null;
  const leaderLine = item
    ? isVariantItem && spotStats
      ? `${spotStats.available} spots open · ${spotStats.sold} sold`
      : formatAuctionLeaderLine({
          lastHighBidderUsername: item.lastHighBidderUsername,
          lastHighBidderId: item.lastHighBidderId,
          currentBidUsd: item.currentBidUsd,
          startingBidUsd: item.startingBidUsd,
          priceUsd: item.priceUsd,
        })
    : overlayDiffersFromActive && previewItem
      ? "Pin selected lot to put it on the block"
      : "No lot pinned";

  const shellClass =
    variant === "overlay"
      ? "flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950"
      : "flex h-full min-h-0 flex-col overflow-hidden bg-transparent";

  const isDesktopPanel = variant === "panel";
  const isCompactRail = isDesktopPanel && compactRail;
  const boardItem = activeBoardRow?.item;
  const sold = boardItem?.status === "sold";
  const skipped = boardItem?.status === "skipped";
  const auctionEndedPendingClose =
    Boolean(boardItem?.biddingOpen && boardItem?.status === "active" && !biddingWindowOpen);

  const panelEnergy =
    roomEnergyScore != null && roomEnergyLevel
      ? { score: roomEnergyScore, level: roomEnergyLevel }
      : computeLiveRoomEnergy({
          viewerCount,
          recentMessageCount: 0,
          bidsLastMinute: 0,
          auctionLive: biddingWindowOpen,
        });

  const queuedCount = queueRows.filter((r) => r.item.status !== "sold" && r.item.status !== "skipped").length;

  if (isCompactRail) {
    const canEndAuction =
      !isVariantItem &&
      Boolean(boardItem && boardItem.status === "active" && (biddingWindowOpen || auctionEndedPendingClose));

    return (
      <div className="flex flex-col live-stage-ui-awake">
        <div className="live-stage-utility-dock space-y-2 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${
                live ? "bg-emerald-500/20 text-emerald-100" : "bg-zinc-800/90 text-zinc-300"
              }`}
            >
              {live ? <span className="size-1 animate-pulse rounded-full bg-emerald-400" aria-hidden /> : null}
              {live ? "Live" : roomStatus}
            </span>
            <span className="text-[9px] font-semibold text-zinc-300">{viewerCount} viewers</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${connectionOk ? "bg-emerald-400" : "bg-amber-400 motion-safe:animate-pulse"}`} aria-hidden />
            <span className={`text-[9px] font-semibold ${connectionOk ? "text-emerald-200" : "text-amber-100"}`}>
              {connectionLabel}
            </span>
          </div>

          <div className="border-t border-white/[0.08] pt-1.5">
            <p className="line-clamp-2 text-[10px] font-bold text-white">
              {item?.title ?? (overlayDiffersFromActive && previewItem ? previewItem.title : "Pin a lot to begin")}
            </p>
            {hostAuctionCountdownLabel && biddingWindowOpen && !isVariantItem ? (
              <p className="mt-0.5 font-mono text-[11px] font-black tabular-nums text-emerald-200">{hostAuctionCountdownLabel}</p>
            ) : (
              <p className="mt-0.5 font-mono text-[12px] font-black tabular-nums text-amber-100">
                {isVariantItem && spotStats?.fromPriceUsd != null
                  ? `From ${formatAuctionMoneyUsd(spotStats.fromPriceUsd)}`
                  : item
                    ? itemMoney(item)
                    : "—"}
              </p>
            )}
            <p className="mt-0.5 truncate text-[9px] font-medium text-amber-200/95">
              {overlayDiffersFromActive
                ? "Push item — buyers cannot purchase yet"
                : isVariantItem && live
                  ? "Spot board live on stage"
                  : leaderLine}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenQueueDrawer}
            className={`w-full rounded-xl border px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${
              queueDrawerOpen
                ? "live-stage-queue-btn-active border-amber-300/45 bg-amber-500/22 text-amber-50"
                : "border-amber-300/20 bg-black/45 text-zinc-100 hover:border-amber-300/35 hover:bg-black/55"
            }`}
          >
            Queue · {queuedCount}
          </button>

          <div className="grid grid-cols-3 gap-1">
            <PrimaryBtn compact onClick={onPinSelected} disabled={!selectedQueueItemId || busy || !hostPinLotEnabled} tone="ghost">
              Pin
            </PrimaryBtn>
            <PrimaryBtn compact onClick={onEndAuction} disabled={busy || !canEndAuction} tone="danger">
              End
            </PrimaryBtn>
            <PrimaryBtn
              compact
              onClick={onNextItem}
              disabled={busy || !queueRows.some((r) => r.item.status === "queued")}
              tone="ghost"
            >
              Next
            </PrimaryBtn>
          </div>

          {!live ? (
            <button
              type="button"
              disabled={busy}
              onClick={onGoLive}
              className="w-full rounded-xl border border-emerald-400/25 bg-emerald-500/12 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-100 disabled:opacity-40"
            >
              Go live
            </button>
          ) : null}
        </div>

        <div className="space-y-1 px-2 pb-2">
          <CollapsibleSection title="Tools" glass defaultOpen={false}>
            {onToggleTeamBoard ? (
              <PrimaryBtn
                compact
                onClick={onToggleTeamBoard}
                disabled={busy}
                tone={teamBoardPanelOpen ? "gold" : "ghost"}
              >
                Teams
              </PrimaryBtn>
            ) : null}
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <PrimaryBtn compact onClick={onOpenObs} disabled={busy} tone="ghost">
                OBS
              </PrimaryBtn>
              <PrimaryBtn compact onClick={onCopyPublic} disabled={busy} tone="ghost">
                Share
              </PrimaryBtn>
            </div>
            <button
              type="button"
              disabled={busy || !live}
              onClick={() => onPatchRoom("end")}
              className="mt-1.5 w-full rounded-lg border border-rose-500/25 py-1 text-[9px] font-black uppercase tracking-wide text-rose-200/90 disabled:opacity-40"
            >
              End show
            </button>
            {roomGovernance ? (
              <div className="mt-2">
                <LiveHostRoomGovernance {...roomGovernance} liveRoomId={liveRoomId} />
              </div>
            ) : null}
          </CollapsibleSection>
          {onVaultModeChange ? (
            <CollapsibleSection title="Mood" glass defaultOpen={false}>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(VAULT_MODE_META) as VaultMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onVaultModeChange(m)}
                    className={`rounded-lg px-1.5 py-1 text-left text-[9px] font-bold transition ${
                      vaultMode === m ? "bg-white/[0.06] text-amber-100" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {VAULT_MODE_META[m].label}
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          ) : null}
          <CollapsibleSection title="Analytics" glass defaultOpen={false}>
            <div className="space-y-2">
              <LiveRoomEnergyMeter score={panelEnergy.score} level={panelEnergy.level} compact />
              <HostRecentSalesTile rows={recentSales} />
              <LiveShowSalesTile
                summary={sellerSummary}
                loading={sellerSummaryLoading}
                refreshError={sellerSummaryRefreshError}
              />
              {feeTier || sellerSummary ? (
                <LiveShowFeeTierTile tier={feeTier} summary={sellerSummary} />
              ) : null}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {/* Top status strip */}
      <header className={`shrink-0 ${isCompactRail ? "p-2" : isDesktopPanel ? "px-2.5 py-2" : "border-b border-white/[0.08] px-3 py-2.5"}`}>
        <div className={isCompactRail ? "px-1 py-1" : "live-stage-glass-tray px-2.5 py-2"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`truncate font-bold text-white ${isCompactRail ? "text-xs" : "text-sm"}`}>{roomTitle}</p>
            <div className={`mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold uppercase tracking-wide ${isCompactRail ? "text-[9px]" : "text-[10px]"}`}>
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
            onClick={onGoLive}
            className="mt-2 w-full rounded-full border border-emerald-400/30 bg-emerald-500/15 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-100 disabled:opacity-40"
          >
            Go live
          </button>
        ) : null}
        </div>
      </header>

      <div className={`min-h-0 flex-1 overflow-y-auto ${isCompactRail ? "space-y-1.5 p-2" : isDesktopPanel ? "space-y-2 px-2.5 py-2" : "space-y-3 px-3 py-3"}`}>
        {!isCompactRail && isDesktopPanel ? (
          <LiveRoomEnergyMeter score={panelEnergy.score} level={panelEnergy.level} compact />
        ) : null}

        {/* Active lot — one-liner in compact rail */}
        <section className={isCompactRail ? "px-1 py-1" : "live-stage-glass-tray p-2"}>
          {!isCompactRail ? (
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">On the block</p>
          ) : null}
          <p className={`line-clamp-1 font-bold text-white ${isCompactRail ? "text-[11px]" : isDesktopPanel ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}>
            {item?.title ?? (overlayDiffersFromActive && previewItem ? previewItem.title : "Pin a lot to begin")}
          </p>
          {!isCompactRail ? (
            <>
          <p className={`font-mono font-black tabular-nums text-amber-100 ${isDesktopPanel ? "mt-1 text-lg" : "mt-2 text-2xl"}`}>
            {isVariantItem && spotStats?.fromPriceUsd != null
              ? formatAuctionMoneyUsd(spotStats.fromPriceUsd)
              : item
                ? itemMoney(item)
                : "—"}
          </p>
          <p className={`font-semibold text-zinc-300 ${isDesktopPanel ? "mt-0.5 text-[10px]" : "mt-1 text-xs"}`}>
            {overlayDiffersFromActive
              ? "Selected in queue — pin it to switch what's on stage"
              : isVariantItem
                ? live
                  ? "Spot board live — buyers pick spots on stage"
                  : leaderLine
                : leaderLine}
          </p>
          {overlayDiffersFromActive ? (
            <p className="mt-1.5 inline-flex rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-100">
              Pin to switch
            </p>
          ) : isVariantItem && live ? (
            <p className="mt-1.5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-100">
              Open spots
            </p>
          ) : hostAuctionCountdownLabel && biddingWindowOpen ? (
            <p className="mt-1.5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-emerald-100">
              {hostAuctionCountdownLabel}
            </p>
          ) : auctionEndedPendingClose ? (
            <p className="mt-1.5 text-[10px] font-semibold text-amber-200/90">Timer ended — close lot on stage overlay</p>
          ) : sold ? (
            <p className="mt-1.5 text-[10px] font-semibold text-emerald-300/90">Lot sold</p>
          ) : skipped ? (
            <p className="mt-1.5 text-[10px] font-semibold text-zinc-400">Lot skipped</p>
          ) : isDesktopPanel && !isVariantItem ? (
            <p className="mt-1 text-[10px] text-zinc-500">Auction controls live on the stage HUD.</p>
          ) : isDesktopPanel && isVariantItem ? (
            <p className="mt-1 text-[10px] text-zinc-500">Spot controls live on the stage HUD.</p>
          ) : null}
            </>
          ) : (
            <p className="mt-0.5 font-mono text-sm font-black tabular-nums text-amber-100/90">{item ? itemMoney(item) : "—"}</p>
          )}

          {!hostPinLotEnabled ? (
            <p className="mt-1.5 text-[10px] font-semibold text-amber-200/90">{HOST_PIN_BLOCKED_AUCTION_LIVE_MSG}</p>
          ) : null}

          {isDesktopPanel ? (
            <div className={`flex gap-1.5 ${isCompactRail ? "mt-1" : "mt-2"}`}>
              <PrimaryBtn
                compact
                onClick={onPinSelected}
                disabled={!selectedQueueItemId || busy || !hostPinLotEnabled}
                tone="ghost"
              >
                Pin
              </PrimaryBtn>
            </div>
          ) : isVariantItem ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <PrimaryBtn onClick={onNextItem} disabled={busy || !queueRows.some((r) => r.item.status === "queued")}>
                Next item
              </PrimaryBtn>
              <PrimaryBtn onClick={onPinSelected} disabled={!selectedQueueItemId || busy || !hostPinLotEnabled} tone="ghost">
                Pin item
              </PrimaryBtn>
            </div>
          ) : (
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
              <PrimaryBtn onClick={onPinSelected} disabled={!selectedQueueItemId || busy || !hostPinLotEnabled}>
                Pin item
              </PrimaryBtn>
              <PrimaryBtn onClick={onNextItem} disabled={busy || !queueRows.some((r) => r.item.status === "queued")}>
                Next item
              </PrimaryBtn>
            </div>
          )}
        </section>

        {/* Queue — full panel only; compact rail uses floating drawer */}
        {!isCompactRail ? (
        <section className="live-stage-glass-tray p-2">
          <VaultQueueCarousel
            tab={queueTab}
            onTab={onQueueTab}
            rows={queueRows}
            giveaways={giveaways}
            selectedId={selectedQueueItemId}
            onSelect={onSelectQueueItem}
            viewerCount={viewerCount}
            busy={busy}
            onPost={onPostItem}
            postDisabled={!hostPinLotEnabled}
            onSkip={onSkipItem}
            onDelete={onDeleteItem}
            onAddAuction={onAddAuction}
            onAddGiveaway={onAddGiveaway}
            onGiveawayOpenEntries={onGiveawayOpenEntries}
            onGiveawayCloseEntries={onGiveawayCloseEntries}
            onGiveawayDraw={onGiveawayDraw}
            onGiveawayCancel={onGiveawayCancel}
            onGiveawayDelete={onGiveawayDelete}
            compact={isDesktopPanel}
          />
        </section>
        ) : null}

        {/* Expandable utility drawers */}
        <div className="space-y-1.5">
          {isDesktopPanel && onVaultModeChange ? (
            <CollapsibleSection title="Room mood" glass>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(VAULT_MODE_META) as VaultMode[]).map((m) => {
                  const meta = VAULT_MODE_META[m];
                  const on = vaultMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onVaultModeChange(m)}
                      className={`rounded-xl px-2 py-2 text-left transition ${
                        on
                          ? "border border-amber-400/35 bg-amber-500/10 shadow-[0_0_20px_-12px_rgba(245,158,11,0.4)]"
                          : "border border-white/[0.06] bg-black/30 hover:border-white/12"
                      }`}
                    >
                      <p className="text-[10px] font-bold text-white">{meta.label}</p>
                      <p className="mt-0.5 text-[9px] leading-snug text-zinc-500">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </CollapsibleSection>
          ) : null}
          {liveRoomId ? (
            <CollapsibleSection title="Shipping" glass defaultOpen>
              <LiveShowShippingPanel liveRoomId={liveRoomId} compact />
            </CollapsibleSection>
          ) : null}
          {!isCompactRail ? (
          <CollapsibleSection title="Tools" glass defaultOpen={false}>
            {onToggleTeamBoard ? (
              <PrimaryBtn
                compact
                onClick={onToggleTeamBoard}
                disabled={busy}
                tone={teamBoardPanelOpen ? "gold" : "ghost"}
              >
                Teams
              </PrimaryBtn>
            ) : null}
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <PrimaryBtn compact onClick={onOpenObs} disabled={busy} tone="ghost">
                OBS
              </PrimaryBtn>
              <PrimaryBtn compact onClick={onCopyPublic} disabled={busy} tone="ghost">
                Share link
              </PrimaryBtn>
            </div>
            {roomGovernance ? (
              <div className="mt-2">
                <LiveHostRoomGovernance {...roomGovernance} liveRoomId={liveRoomId} />
              </div>
            ) : null}
          </CollapsibleSection>
          ) : null}
          <CollapsibleSection title="Analytics" glass defaultOpen={false}>
            <div className="space-y-2">
              <HostRecentSalesTile rows={recentSales} />
              <LiveShowSalesTile
                summary={sellerSummary}
                loading={sellerSummaryLoading}
                refreshError={sellerSummaryRefreshError}
              />
              {feeTier || sellerSummary ? (
                <LiveShowFeeTierTile tier={feeTier} summary={sellerSummary} />
              ) : null}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
