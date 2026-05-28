"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { formatAuctionLeaderLine } from "@/lib/live-auction-winner-display";
import { resolveLiveItemOverlayPrice } from "@/lib/live-auction-overlay-price";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";

export type LiveStageMotionBurst = "bid" | "bid_war" | "last_second" | "sold" | null;

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

const ENERGY_GLOW: Record<LiveRoomEnergyLevel, string> = {
  calm: "shadow-[0_0_24px_-16px_rgba(251,191,36,0.15)]",
  warming: "shadow-[0_0_32px_-14px_rgba(251,191,36,0.28)]",
  hot: "shadow-[0_0_40px_-12px_rgba(251,191,36,0.42)]",
  electric: "shadow-[0_0_52px_-8px_rgba(251,191,36,0.55)] live-hud-electric",
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
};

function HudPill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`live-stage-hud-pill flex min-w-0 items-center gap-2 ${className}`}>{children}</div>
  );
}

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
      ? "border-amber-400/45 bg-gradient-to-r from-amber-400/90 via-amber-300/90 to-yellow-200/90 text-zinc-950 shadow-[0_0_20px_-8px_rgba(251,191,36,0.8)]"
      : tone === "danger"
        ? "border-rose-400/40 bg-rose-950/55 text-rose-100"
        : tone === "urgent"
          ? "border-orange-400/45 bg-orange-500/20 text-orange-100"
          : "border-white/10 bg-white/[0.05] text-zinc-200";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] transition disabled:opacity-40 ${cls}`}
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
}: LiveAuctionHudProps) {
  const item = overlayQueueRow?.item;
  const boardItem = activeBoardRow?.item;
  const thumb = item?.imageUrl?.trim();
  const overlayPrice = item ? fmtOverlayLead(item) : null;
  const sold = boardItem?.status === "sold";
  const skipped = boardItem?.status === "skipped";
  const auctionRunning = Boolean(biddingWindowOpen && boardItem);
  const auctionEndedPendingClose =
    Boolean(boardItem?.biddingOpen && boardItem?.status === "active" && !biddingWindowOpen);
  const canEndAuction = Boolean(boardItem && boardItem.status === "active" && (auctionRunning || auctionEndedPendingClose));

  const winnerLine = item
    ? formatAuctionLeaderLine({
        lastHighBidderUsername: item.lastHighBidderUsername,
        lastHighBidderId: item.lastHighBidderId,
        currentBidUsd: item.currentBidUsd,
        startingBidUsd: item.startingBidUsd,
        priceUsd: item.priceUsd,
      })
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
            : "";

  const statusLabel = sold
    ? "Sold"
    : skipped
      ? "Skipped"
      : auctionRunning
        ? "Live"
        : auctionEndedPendingClose
          ? "Ended"
          : roomStatusLive
            ? "Ready"
            : "Offline";

  const statusTone = sold
    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
    : skipped
      ? "border-zinc-500/35 bg-zinc-800/50 text-zinc-300"
      : auctionRunning
        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
        : auctionEndedPendingClose
          ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
          : "border-white/10 bg-black/40 text-zinc-400";

  return (
    <div
      className={`live-stage-auction-hud pointer-events-auto w-full ${ENERGY_GLOW[energyLevel]} ${burstClass}`}
      data-testid="live-auction-hud"
    >
      <div className="live-stage-hud-glass flex min-h-[52px] max-h-[64px] items-stretch gap-1.5 p-1.5">
        {/* LEFT — item identity */}
        <HudPill className="flex-[1.15] px-2">
          <div className="relative shrink-0">
            <div className="size-9 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-[9px] font-black text-zinc-500">
                  {(item?.title ?? "—").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {auctionRunning ? (
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-emerald-400/50 bg-emerald-400 motion-safe:animate-pulse" aria-hidden />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight text-white">
              {item ? hostQueueTitleLine(item) : "No lot pinned"}
            </p>
            {item ? (
              <p className="truncate text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                Unit #{item.sortOrder}
              </p>
            ) : null}
            {winnerLine ? (
              <p className="truncate text-[9px] font-medium text-amber-100/80">{winnerLine}</p>
            ) : null}
          </div>
        </HudPill>

        {/* CENTER — bid + timer + status */}
        <HudPill className="flex-1 justify-center px-3">
          <div className="flex flex-col items-center gap-0.5">
            <p
              className={`font-mono text-xl font-black tabular-nums leading-none tracking-tight text-white motion-safe:transition-transform ${
                motionBurst === "bid" || motionBurst === "bid_war" ? "[animation:live-price-glow_0.6s_ease-out]" : ""
              }`}
            >
              {overlayPrice?.amountFormatted ?? "—"}
            </p>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              {overlayPrice?.label ?? "Opening bid"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
              {hostAuctionCountdownLabel ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-black tabular-nums ${
                    timerUrgent
                      ? "border-orange-400/45 bg-orange-500/15 text-orange-100 motion-safe:[animation:live-countdown-pulse_0.8s_ease-in-out_infinite]"
                      : "border-emerald-400/30 bg-emerald-500/12 text-emerald-100"
                  }`}
                >
                  {hostAuctionCountdownLabel}
                </span>
              ) : auctionEndedPendingClose ? (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-black tabular-nums text-amber-100">
                  00:00
                </span>
              ) : null}
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${statusTone}`}>
                {auctionRunning ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                    {statusLabel}
                  </span>
                ) : (
                  statusLabel
                )}
              </span>
              {motionBurst === "bid_war" ? (
                <span className="live-hud-bid-war-tag rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-rose-100">
                  Bid war
                </span>
              ) : null}
            </div>
          </div>
        </HudPill>

        {/* RIGHT — contextual actions */}
        <HudPill className="shrink-0 justify-end gap-1 px-2">
          {sold || skipped ? null : auctionRunning ? (
            <>
              <button
                type="button"
                aria-pressed={hostClutchTimeEnabled}
                onClick={onToggleClutch}
                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] transition ${
                  hostClutchTimeEnabled
                    ? "border-fuchsia-400/45 bg-fuchsia-500/15 text-fuchsia-100"
                    : "border-white/10 bg-white/[0.05] text-zinc-400"
                }`}
              >
                {hostClutchTimeEnabled ? "SD on" : "SD"}
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
                Close lot
              </HudAction>
            ) : null
          ) : roomStatusLive && hostStartLiveAuctionEnabled ? (
            <>
              <select
                value={hostAuctionDurationSec}
                onChange={(e) => onHostAuctionDurationSec(Number(e.target.value))}
                className="rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-semibold text-zinc-200"
                aria-label="Auction clock"
              >
                {[5, 10, 15, 20, 30].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
              </select>
              <HudAction
                tone="gold"
                disabled={hostLiveItemAuctionBusy}
                onClick={onStartAuction}
              >
                {hostLiveItemAuctionBusy ? "…" : "Start"}
              </HudAction>
            </>
          ) : canEndAuction && onEndAuction ? (
            <HudAction tone="danger" disabled={hostBusy} onClick={onEndAuction}>
              End
            </HudAction>
          ) : !roomStatusLive ? (
            <span className="text-[9px] font-semibold text-amber-200/70">Go live</span>
          ) : null}
          {!sold && !skipped && onNextItem ? (
            <HudAction tone="ghost" disabled={hostBusy} onClick={onNextItem}>
              Next
            </HudAction>
          ) : null}
        </HudPill>
      </div>
    </div>
  );
}
