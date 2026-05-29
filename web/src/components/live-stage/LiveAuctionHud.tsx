"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { formatAuctionLeaderLine, formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import { resolveLiveItemOverlayPrice } from "@/lib/live-auction-overlay-price";
import {
  isVariantSalesFormat,
  summarizeVariantSpots,
  variantHostSpotsLabel,
} from "@/lib/live-item-variant-presets";
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
  roomId?: string;
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
  onBeginTeamBreak?: () => void;
  teamBreakBusy?: boolean;
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
  tone?: "gold" | "danger" | "ghost" | "urgent" | "emerald";
}) {
  const cls =
    tone === "gold"
      ? "border-amber-300/45 bg-amber-500/25 text-amber-50 shadow-[0_0_12px_-4px_rgba(255,215,80,0.35)]"
      : tone === "emerald"
        ? "border-emerald-300/45 bg-emerald-500/25 text-emerald-50 shadow-[0_0_12px_-4px_rgba(52,211,153,0.35)]"
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
  roomId,
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
  onBeginTeamBreak,
  teamBreakBusy,
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
  const isVariantItem = Boolean(commerceItem && isVariantSalesFormat(commerceItem.salesFormat));
  const spotStats = isVariantItem ? summarizeVariantSpots(commerceItem?.variants) : null;
  const breakReady = Boolean(commerceItem?.variantBreakReadyAt);
  const breakBegan = Boolean(commerceItem?.variantBreakBeganAt);
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
    ? roomStatusLive && !sold && !skipped && !breakBegan
    : roomStatusLive && !auctionRunning && !auctionEndedPendingClose && !sold && !skipped;
  const variantHeroAmount =
    spotStats?.fromPriceUsd != null ? formatAuctionMoneyUsd(spotStats.fromPriceUsd) : "—";
  const variantHeroSub =
    spotStats != null
      ? `${spotStats.available} available · ${spotStats.sold} sold`
      : isVariantItem
        ? "Open spots"
        : null;
  const variantBadgeLabel = variantHostSpotsLabel({
    roomLive: roomStatusLive,
    available: spotStats?.available ?? 0,
    breakReady,
    breakBegan,
  });

  const handleStartClick = () => {
    const target = boardItem ?? item;
    console.log("[stage hud] start clicked", {
      roomId: roomId ?? null,
      itemId: target?.id ?? null,
      salesFormat: target?.salesFormat ?? null,
      biddingOpen: target?.biddingOpen ?? null,
      status: target?.status ?? null,
    });
    onStartAuction();
  };

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
        <div className="live-stage-command-bar flex min-h-[48px] items-center justify-between gap-3 px-4 py-2">
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
      }`}
      data-testid="live-auction-hud"
    >
      <div
        className={`live-stage-command-bar relative flex min-h-[48px] max-h-[58px] items-stretch gap-0 overflow-hidden ${
          preAuction && !isVariantItem ? "live-stage-hud-glass-idle" : ""
        } ${lotTransitionPhase === "incoming" ? "motion-safe:animate-[live-lot-slide-up_0.5s_var(--live-ease)_both]" : ""} ${
          breakReady && !breakBegan ? "live-stage-command-bar-ready" : ""
        }`}
      >
        {/* LEFT — item identity */}
        <div className="live-stage-command-section flex min-w-0 flex-[1.05] items-center gap-1.5 border-r border-amber-400/10 px-2.5 py-1">
          <div className="size-8 shrink-0 overflow-hidden rounded-md bg-zinc-900/80 ring-1 ring-amber-300/15">
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

        {/* CENTER — price / timer / spot status */}
        <div className="live-stage-command-section flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-1">
          <p
            className={`live-stage-hud-bid-hero font-mono text-[1.35rem] font-black leading-none tabular-nums tracking-tight ${
              motionBurst === "bid" || motionBurst === "bid_war" ? "[animation:live-price-glow_0.6s_ease-out]" : ""
            } ${breakReady && !breakBegan ? "text-emerald-100" : ""}`}
          >
            {breakReady && !breakBegan ? "BREAK READY" : isVariantItem ? variantHeroAmount : overlayPrice?.amountFormatted ?? "—"}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            {isVariantItem ? (
              <span
                className={`text-[9px] font-bold uppercase tracking-wide ${
                  breakReady && !breakBegan ? "text-emerald-200" : "text-emerald-200/90"
                }`}
              >
                {breakBegan ? "Break in progress" : breakReady ? "All divisions sold" : variantHeroSub ?? "Spot board"}
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

        {/* RIGHT — actions */}
        <div className="live-stage-command-section flex shrink-0 items-center gap-1 border-l border-amber-400/10 px-2 py-1">
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
          ) : isVariantItem && breakReady && !breakBegan && onBeginTeamBreak ? (
            <HudAction tone="emerald" disabled={teamBreakBusy || hostBusy} onClick={onBeginTeamBreak}>
              {teamBreakBusy ? "…" : "Begin Break"}
            </HudAction>
          ) : isVariantItem && preAuction ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] ${
                breakBegan
                  ? "border-emerald-300/35 bg-emerald-500/20 text-emerald-100"
                  : breakReady
                    ? "border-emerald-300/45 bg-emerald-500/25 text-emerald-50"
                    : roomStatusLive
                      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                      : "border-zinc-500/30 bg-black/40 text-zinc-400"
              }`}
            >
              {variantBadgeLabel}
            </span>
          ) : preAuction && hostStartLiveAuctionEnabled ? (
            <>
              <select
                value={hostAuctionDurationSec}
                onChange={(e) => onHostAuctionDurationSec(Number(e.target.value))}
                className="max-w-[3rem] rounded-full border border-white/[0.08] bg-black/40 px-1 py-0.5 text-[8px] text-zinc-300"
                aria-label="Auction clock"
              >
                {[5, 10, 15, 20, 30].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
              </select>
              <HudAction tone="gold" disabled={hostLiveItemAuctionBusy} onClick={handleStartClick}>
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
