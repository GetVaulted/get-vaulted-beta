"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { formatAuctionLeaderLine, formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import { resolveLiveItemOverlayPrice } from "@/lib/live-auction-overlay-price";
import { isVariantPurchaseItem, summarizeVariantSpots } from "@/lib/live-item-variant-presets";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import type { LiveLotTransitionPhase } from "@/components/live-stage/LiveLotTransitionBanner";

export type LiveStageMotionBurst = "bid" | "bid_war" | "last_second" | "sold" | "no_bids" | null;

type QueueRowLite = { item: LiveRoomItemDTO };

function hostQueueTitleLine(item: Pick<LiveRoomItemDTO, "title" | "displayTitle">) {
  return item.displayTitle?.trim() || item.title;
}

function fmtOverlayLead(
  item: Pick<
    LiveRoomItemDTO,
    "priceUsd" | "startingBidUsd" | "currentBidUsd" | "status" | "lastHighBidderId" | "lastHighBidderUsername"
  >,
) {
  return resolveLiveItemOverlayPrice({
    commerceMode: "auction",
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderId: item.lastHighBidderId,
    lastHighBidderUsername: item.lastHighBidderUsername,
  });
}

const ENERGY_WRAPPER: Record<LiveRoomEnergyLevel, string> = {
  calm: "live-stage-hud-energy-calm before:opacity-35",
  warming: "live-stage-hud-energy-warming before:opacity-45",
  hot: "live-stage-hud-energy-hot before:opacity-55",
  electric: "live-stage-hud-energy-electric before:opacity-65",
};

type LiveAuctionHudProps = {
  vaultMode: VaultMode;
  overlayQueueRow: QueueRowLite | null;
  activeBoardRow: QueueRowLite | null;
  roomStatusLive: boolean;
  hostAuctionCountdownLabel: string | null;
  biddingWindowOpen: boolean;
  hostAuctionDurationSec: number;
  onHostAuctionDurationSec: (sec: number) => void;
  hostClutchTimeEnabled: boolean;
  onToggleClutch: () => void;
  hostStartLiveAuctionEnabled: boolean;
  hostLiveItemAuctionBusy: boolean;
  onStartAuction: () => void;
  onEndAuction?: () => void;
  onNextItem?: () => void;
  hostBusy?: boolean;
  energyLevel?: LiveRoomEnergyLevel;
  motionBurst?: LiveStageMotionBurst;
  lotTransitionPhase?: LiveLotTransitionPhase;
};

function HudAction({
  children,
  onClick,
  disabled,
  tone = "ghost",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "gold" | "danger" | "ghost" | "urgent";
}) {
  const cls =
    tone === "gold"
      ? "border-amber-300/45 bg-amber-500/25 text-amber-50 shadow-[0_0_12px_-4px_rgba(255,215,80,0.35)]"
      : tone === "danger"
        ? "border-rose-400/40 bg-rose-950/70 text-rose-50"
        : tone === "urgent"
          ? "border-orange-400/40 bg-orange-500/20 text-orange-50"
          : "border-white/15 bg-black/55 text-zinc-100";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] transition hover:-translate-y-px disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function LiveAuctionHud({
  overlayQueueRow,
  activeBoardRow,
  roomStatusLive,
  hostAuctionCountdownLabel,
  biddingWindowOpen,
  hostAuctionDurationSec,
  onHostAuctionDurationSec,
  hostClutchTimeEnabled,
  onToggleClutch,
  hostStartLiveAuctionEnabled,
  hostLiveItemAuctionBusy,
  onStartAuction,
  onEndAuction,
  onNextItem,
  hostBusy,
  energyLevel = "calm",
  motionBurst = null,
  lotTransitionPhase = "idle",
}: LiveAuctionHudProps) {
  const item = overlayQueueRow?.item;
  const boardItem = activeBoardRow?.item;
  const commerceItem = boardItem ?? item;
  const isVariantItem = isVariantPurchaseItem(commerceItem);
  const spotStats = isVariantItem ? summarizeVariantSpots(commerceItem?.variants) : null;
  const thumb = item?.imageUrl?.trim();
  const overlayPrice = item && !isVariantItem ? fmtOverlayLead(item) : null;
  const sold = boardItem?.status === "sold";
  const skipped = boardItem?.status === "skipped";
  const auctionRunning = isVariantItem ? false : Boolean(biddingWindowOpen && boardItem);
  const auctionEndedPendingClose = isVariantItem
    ? false
    : Boolean(boardItem?.biddingOpen && boardItem?.status === "active" && !biddingWindowOpen);
  const canEndAuction = isVariantItem
    ? false
    : Boolean(boardItem && boardItem.status === "active" && (auctionRunning || auctionEndedPendingClose));
  const preAuction = isVariantItem
    ? roomStatusLive && !sold && !skipped
    : roomStatusLive && !auctionRunning && !auctionEndedPendingClose && !sold && !skipped;
  const variantHeroAmount =
    spotStats?.fromPriceUsd != null ? formatAuctionMoneyUsd(spotStats.fromPriceUsd) : "—";
  const variantHeroSub =
    spotStats != null
      ? `${spotStats.available} open · ${spotStats.sold} sold`
      : null;

  const winnerLine =
    item && !isVariantItem
      ? formatAuctionLeaderLine({
          lastHighBidderUsername: item.lastHighBidderUsername,
          lastHighBidderId: item.lastHighBidderId,
          currentBidUsd: item.currentBidUsd,
          startingBidUsd: item.startingBidUsd,
          priceUsd: item.priceUsd,
        })
      : isVariantItem && variantHeroSub
        ? variantHeroSub
        : null;

  const timerUrgent =
    hostAuctionCountdownLabel != null &&
    (() => {
      const parts = hostAuctionCountdownLabel.split(":");
      if (parts.length !== 2) return false;
      const sec = Number(parts[1]);
      return parts[0] === "00" && Number.isFinite(sec) && sec <= 5;
    })();

  const burstClass =
    motionBurst === "bid"
      ? "live-hud-bid-flash"
      : motionBurst === "bid_war"
        ? "live-hud-bid-war"
        : motionBurst === "last_second"
          ? "live-hud-timer-slam"
          : motionBurst === "sold"
            ? "live-hud-sold-pulse"
            : motionBurst === "no_bids"
              ? "opacity-80"
              : "";

  const hudHidden = lotTransitionPhase === "sold_spotlight" || lotTransitionPhase === "next_intro";

  if (sold && !auctionRunning) {
    return (
      <div
        className={`live-stage-auction-hud relative w-full live-stage-hud-sold live-stage-hud-sold-sweep ${ENERGY_WRAPPER[energyLevel]}`}
        data-testid="live-auction-hud"
      >
        <div className="live-stage-hud-glass flex min-h-[48px] items-center justify-between gap-3 px-4 py-2 before:pointer-events-none before:absolute before:-inset-px before:rounded-[inherit] before:bg-gradient-to-r before:from-emerald-400/20 before:via-amber-300/15 before:to-transparent before:content-['']">
          <div className="relative z-[1] flex min-w-0 items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/90">Sold</span>
            <p className="truncate text-sm font-bold text-white">
              {boardItem?.lastHighBidderUsername?.trim()
                ? `@${boardItem.lastHighBidderUsername.trim()}`
                : "No winner"}
            </p>
          </div>
          <p className="relative z-[1] font-mono text-lg font-black tabular-nums text-amber-100">
            {formatAuctionMoneyUsd(boardItem?.currentBidUsd)}
          </p>
          {onNextItem ? (
            <HudAction tone="ghost" disabled={hostBusy} onClick={onNextItem}>
              Next
            </HudAction>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`live-stage-auction-hud relative w-full transition-opacity duration-500 ${ENERGY_WRAPPER[energyLevel]} ${burstClass} ${
        hudHidden ? "pointer-events-none opacity-0" : "opacity-100"
      } before:pointer-events-none before:absolute before:-inset-px before:rounded-[inherit] before:bg-gradient-to-r before:from-amber-400/35 before:via-transparent before:to-amber-500/15 before:content-['']`}
      data-testid="live-auction-hud"
    >
      <div
        className={`live-stage-hud-glass relative flex min-h-[48px] max-h-[58px] items-center gap-1 px-1.5 py-1 ${
          preAuction ? "live-stage-hud-glass-idle" : ""
        } ${lotTransitionPhase === "incoming" ? "motion-safe:animate-[live-lot-slide-up_0.5s_var(--live-ease)_both]" : ""}`}
      >
        {/* LEFT — compact item identity */}
        <div className="live-stage-hud-pill flex min-w-0 flex-[0.95] items-center gap-1.5 px-2 py-0.5">
          <div className="size-8 shrink-0 overflow-hidden rounded-md bg-zinc-900/80 ring-1 ring-white/[0.06]">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-[8px] font-black text-zinc-600">
                {(item?.title ?? "—").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-zinc-100">
              {item ? hostQueueTitleLine(item) : "No lot pinned"}
              {item ? <span className="font-medium text-zinc-500"> · #{item.sortOrder}</span> : null}
            </p>
            {winnerLine ? (
              <p className="truncate text-[9px] font-medium text-amber-200/90">{winnerLine}</p>
            ) : null}
          </div>
        </div>

        {/* CENTER — bid hero + timer */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1">
          <p
            className={`live-stage-hud-bid-hero font-mono text-[1.35rem] font-black leading-none tabular-nums tracking-tight ${
              motionBurst === "bid" || motionBurst === "bid_war" ? "[animation:live-price-glow_0.6s_ease-out]" : ""
            }`}
          >
            {isVariantItem ? variantHeroAmount : overlayPrice?.amountFormatted ?? "—"}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            {isVariantItem ? (
              <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-200/90">
                {spotStats?.available === 0 ? "All spots sold" : "Direct spot purchase"}
              </span>
            ) : hostAuctionCountdownLabel ? (
              <span
                className={`font-mono text-[11px] font-black tabular-nums ${
                  timerUrgent
                    ? "live-stage-hud-timer-urgent motion-safe:[animation:live-countdown-pulse_0.7s_ease-in-out_infinite]"
                    : auctionRunning
                      ? "live-stage-hud-timer-live"
                      : "text-zinc-400"
                }`}
              >
                {hostAuctionCountdownLabel}
              </span>
            ) : auctionEndedPendingClose ? (
              <span className="font-mono text-[11px] font-black tabular-nums text-amber-200/80">00:00</span>
            ) : null}
            {motionBurst === "bid_war" ? (
              <span className="live-hud-bid-war-tag rounded-full px-1.5 py-px text-[7px] font-black uppercase tracking-wider text-rose-200">
                Bid war
              </span>
            ) : null}
          </div>
        </div>

        {/* RIGHT — contextual actions */}
        <div className="live-stage-hud-pill flex shrink-0 items-center gap-1 px-1.5 py-0.5">
          {skipped ? (
            <span className="text-[8px] font-bold uppercase tracking-wide text-zinc-500">Skipped</span>
          ) : auctionRunning ? (
            <>
              <button
                type="button"
                aria-pressed={hostClutchTimeEnabled}
                onClick={onToggleClutch}
                className={`rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase ${
                  hostClutchTimeEnabled ? "text-fuchsia-200" : "text-zinc-600"
                }`}
              >
                SD
              </button>
              {onEndAuction ? (
                <HudAction tone="danger" disabled={hostBusy} onClick={onEndAuction}>
                  End
                </HudAction>
              ) : null}
            </>
          ) : auctionEndedPendingClose ? (
            onEndAuction ? (
              <HudAction tone="urgent" disabled={hostBusy} onClick={onEndAuction}>
                Close
              </HudAction>
            ) : null
          ) : isVariantItem && preAuction ? (
            <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-emerald-100">
              {roomStatusLive ? "Spot Board Live" : "Go live for spots"}
            </span>
          ) : preAuction && hostStartLiveAuctionEnabled ? (
            <>
              <select
                value={hostAuctionDurationSec}
                onChange={(e) => onHostAuctionDurationSec(Number(e.target.value))}
                className="max-w-[3rem] rounded-full border border-white/[0.06] bg-transparent px-1 py-0.5 text-[8px] text-zinc-400"
                aria-label="Auction clock"
              >
                {[5, 10, 15, 20, 30].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
              </select>
              <HudAction tone="gold" disabled={hostLiveItemAuctionBusy} onClick={onStartAuction}>
                {hostLiveItemAuctionBusy ? "…" : "Start"}
              </HudAction>
            </>
          ) : canEndAuction && onEndAuction ? (
            <HudAction tone="danger" disabled={hostBusy} onClick={onEndAuction}>
              End
            </HudAction>
          ) : !roomStatusLive ? (
            <span className="text-[8px] text-zinc-600">Offline</span>
          ) : null}
          {!sold && !skipped && onNextItem ? (
            <HudAction tone="ghost" disabled={hostBusy} onClick={onNextItem}>
              Next
            </HudAction>
          ) : null}
        </div>
      </div>
    </div>
  );
}
