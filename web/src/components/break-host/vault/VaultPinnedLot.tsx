"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { formatAuctionLeaderLine, formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import { resolveLiveItemOverlayPrice } from "@/lib/live-auction-overlay-price";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import { VAULT_MODE_META } from "@/components/break-host/vault/vault-modes";

type ClaimLite = { user: { username: string } } | null;
type QueueRowLite = { item: LiveRoomItemDTO; claim: ClaimLite; claims: { user: { username: string } }[] };

function fmtOverlayLead(
  item: Pick<
    LiveRoomItemDTO,
    "priceUsd" | "startingBidUsd" | "currentBidUsd" | "status" | "lastHighBidderId" | "lastHighBidderUsername"
  >,
  commerceMode: "auction" | "buy_now" = "auction",
) {
  return resolveLiveItemOverlayPrice({
    commerceMode,
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderId: item.lastHighBidderId,
    lastHighBidderUsername: item.lastHighBidderUsername,
  });
}

function hostQueueTitleLine(item: Pick<LiveRoomItemDTO, "title" | "displayTitle">) {
  return item.displayTitle?.trim() || item.title;
}

type VaultPinnedLotProps = {
  variant: "desktop" | "mobile";
  /** In-stage bottom overlay for 9:16 host console (less card chrome). */
  embedded?: boolean;
  vaultMode: VaultMode;
  overlayQueueRow: QueueRowLite | null;
  activeBoardRow: QueueRowLite | null;
  roomStatusLive: boolean;
  viewerCount: number;
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
  hostClockSkewMs: number;
};

function BidVelocityBar({
  biddingOpen,
  endsAt,
  clockSkewMs,
}: {
  biddingOpen: boolean;
  endsAt: string | null;
  clockSkewMs: number;
}) {
  const now = Date.now() + (Number.isFinite(clockSkewMs) ? clockSkewMs : 0);
  const end = endsAt ? Date.parse(endsAt) : NaN;
  let velocity = 0;
  if (biddingOpen && Number.isFinite(end) && end > now) {
    const totalGuess = 30000;
    velocity = 1 - Math.max(0, Math.min(1, (end - now) / totalGuess));
  }
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
        <span>Bid velocity</span>
        <span className="tabular-nums text-zinc-400">{biddingOpen ? `${Math.round(velocity * 100)}%` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/90 via-amber-300/90 to-rose-500/90 motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${Math.round((biddingOpen ? 15 + velocity * 85 : 10) * 10) / 10}%` }}
        />
      </div>
    </div>
  );
}

function DesktopCompactOverlayBar({
  item,
  activeBoardRow,
  overlayPrice,
  hostAuctionCountdownLabel,
  biddingWindowOpen,
  roomStatusLive,
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
}: {
  item: LiveRoomItemDTO | undefined;
  activeBoardRow: QueueRowLite | null;
  overlayPrice: ReturnType<typeof fmtOverlayLead> | null;
  hostAuctionCountdownLabel: string | null;
  biddingWindowOpen: boolean;
  roomStatusLive: boolean;
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
}) {
  const thumb = item?.imageUrl?.trim();
  const boardItem = activeBoardRow?.item;
  const sold = boardItem?.status === "sold";
  const skipped = boardItem?.status === "skipped";
  const auctionRunning = Boolean(biddingWindowOpen && boardItem);
  const auctionEndedPendingClose =
    Boolean(boardItem?.biddingOpen && boardItem?.status === "active" && !biddingWindowOpen);
  const canEndAuction = Boolean(boardItem && boardItem.status === "active" && (auctionRunning || auctionEndedPendingClose));
  const leaderLine = item
    ? formatAuctionLeaderLine({
        lastHighBidderUsername: item.lastHighBidderUsername,
        lastHighBidderId: item.lastHighBidderId,
        currentBidUsd: item.currentBidUsd,
        startingBidUsd: item.startingBidUsd,
        priceUsd: item.priceUsd,
      })
    : null;

  const statusPill = sold ? (
    <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-100">
      Sold
    </span>
  ) : skipped ? (
    <span className="rounded-full border border-zinc-500/40 bg-zinc-800/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-300">
      Skipped
    </span>
  ) : auctionRunning ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-100">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
      Live
    </span>
  ) : auctionEndedPendingClose ? (
    <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-100">
      Ended
    </span>
  ) : roomStatusLive ? (
    <span className="rounded-full border border-zinc-600/40 bg-black/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
      Ready
    </span>
  ) : (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100/90">
      Offline
    </span>
  );

  return (
    <div className="relative flex items-center gap-2 px-2 py-1.5">
      {/* Left — item identity */}
      <div className="flex min-w-0 flex-[1.4] items-center gap-2">
        <div className="relative shrink-0">
          <div className="relative size-10 overflow-hidden rounded-md bg-zinc-900 ring-1 ring-white/10">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-[10px] font-black text-zinc-500">
                {(item?.title ?? "—").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          {auctionRunning ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/90 text-[6px] font-black text-white"
              aria-hidden
            >
              ●
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold leading-tight text-white">
            {item ? hostQueueTitleLine(item) : "No lot pinned"}
          </p>
          {item ? (
            <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              Unit #{item.sortOrder}
            </p>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <p className="text-[10px] font-bold text-zinc-400">
              {overlayPrice?.label ?? "Opening bid"}{" "}
              <span className="font-mono text-[11px] tabular-nums text-amber-100">
                {overlayPrice?.amountFormatted ?? "—"}
              </span>
            </p>
            {leaderLine ? (
              <p className="truncate text-[10px] font-semibold text-zinc-300">{leaderLine}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Middle — timer + status */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-1">
        {hostAuctionCountdownLabel ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-0.5 text-[11px] font-black tabular-nums text-emerald-100">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
            {hostAuctionCountdownLabel}
          </span>
        ) : auctionEndedPendingClose ? (
          <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-black tabular-nums text-amber-100">
            00:00
          </span>
        ) : null}
        {statusPill}
      </div>

      {/* Right — auction controls */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {!sold && !skipped && roomStatusLive && !auctionRunning && !auctionEndedPendingClose ? (
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-zinc-500">
              <select
                value={hostAuctionDurationSec}
                onChange={(e) => onHostAuctionDurationSec(Number(e.target.value))}
                className="rounded border border-white/12 bg-black/50 px-1 py-0.5 text-[9px] font-semibold text-zinc-200"
              >
                {[5, 10, 15, 20, 30].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-pressed={hostClutchTimeEnabled}
              onClick={onToggleClutch}
              className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide transition ${
                hostClutchTimeEnabled
                  ? "border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-100"
                  : "border-white/12 bg-black/40 text-zinc-500"
              }`}
            >
              SD
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          {canEndAuction && onEndAuction ? (
            <button
              type="button"
              disabled={hostBusy}
              onClick={onEndAuction}
              className="rounded-lg border border-rose-400/35 bg-rose-950/50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-rose-100 disabled:opacity-40"
            >
              End
            </button>
          ) : hostStartLiveAuctionEnabled ? (
            <button
              type="button"
              disabled={!hostStartLiveAuctionEnabled || hostLiveItemAuctionBusy}
              onClick={onStartAuction}
              className="rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-200 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_16px_-8px_rgba(251,191,36,0.75)] disabled:opacity-40"
            >
              {hostLiveItemAuctionBusy ? "…" : "Start"}
            </button>
          ) : sold || skipped ? null : !roomStatusLive ? (
            <span className="text-[9px] font-semibold text-amber-200/80">Go live first</span>
          ) : auctionEndedPendingClose && onEndAuction ? (
            <button
              type="button"
              disabled={hostBusy}
              onClick={onEndAuction}
              className="rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
            >
              Close lot
            </button>
          ) : null}
          {onNextItem ? (
            <button
              type="button"
              disabled={hostBusy}
              onClick={onNextItem}
              className="rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-200 disabled:opacity-40"
            >
              Next
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function VaultPinnedLot({
  variant,
  embedded = false,
  vaultMode,
  overlayQueueRow,
  activeBoardRow,
  roomStatusLive,
  viewerCount,
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
  hostClockSkewMs,
}: VaultPinnedLotProps) {
  const meta = VAULT_MODE_META[vaultMode];
  const isMobile = variant === "mobile";
  const compactEmbedded = embedded && !isMobile;
  const item = overlayQueueRow?.item;
  const thumb = item?.imageUrl?.trim();
  const reserveMet =
    item?.priceUsd != null && Number.isFinite(item.priceUsd) && item.currentBidUsd != null && Number.isFinite(item.currentBidUsd)
      ? item.currentBidUsd >= item.priceUsd
      : null;
  const overlayPrice = item ? fmtOverlayLead(item) : null;

  if (compactEmbedded) {
    return (
      <div className="relative w-full rounded-lg p-px">
        <div
          className="pointer-events-none absolute -inset-px rounded-[inherit] bg-gradient-to-br from-amber-400/25 via-transparent to-transparent opacity-50"
          aria-hidden
        />
        <div
          className="relative overflow-hidden rounded-[inherit] border border-white/[0.08] bg-black/50 backdrop-blur-md"
          style={{ boxShadow: "0 4px 20px -12px rgba(0,0,0,0.9)" }}
        >
          <DesktopCompactOverlayBar
            item={item}
            activeBoardRow={activeBoardRow}
            overlayPrice={overlayPrice}
            hostAuctionCountdownLabel={hostAuctionCountdownLabel}
            biddingWindowOpen={biddingWindowOpen}
            roomStatusLive={roomStatusLive}
            hostAuctionDurationSec={hostAuctionDurationSec}
            onHostAuctionDurationSec={onHostAuctionDurationSec}
            hostClutchTimeEnabled={hostClutchTimeEnabled}
            onToggleClutch={onToggleClutch}
            hostStartLiveAuctionEnabled={hostStartLiveAuctionEnabled}
            hostLiveItemAuctionBusy={hostLiveItemAuctionBusy}
            onStartAuction={onStartAuction}
            onEndAuction={onEndAuction}
            onNextItem={onNextItem}
            hostBusy={hostBusy}
          />
        </div>
      </div>
    );
  }

  const shell = (
    <>
      <div
        className={`pointer-events-none absolute -inset-px rounded-[inherit] bg-gradient-to-br ${meta.accent} p-px opacity-[0.55]`}
        aria-hidden
      />
      <div
        className={`relative overflow-hidden rounded-[inherit] border border-white/[0.08] backdrop-blur-[var(--live-blur-xl)] ${
          embedded ? "bg-black/72" : `bg-zinc-950/55 ${meta.glow}`
        }`}
        style={{ boxShadow: embedded ? "0 8px 32px -16px rgba(0,0,0,0.85)" : "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 48px -28px rgba(0,0,0,0.85)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_10%_0%,var(--vault-chrome-tint),transparent_55%)]"
          aria-hidden
        />
        <div
          className={`relative flex items-stretch max-[380px]:gap-2 max-[380px]:px-2.5 max-[380px]:py-2 ${
            compactEmbedded ? "gap-2 px-2.5 py-2" : "gap-3 px-3 py-2.5"
          }`}
        >
          <div className="relative shrink-0">
            <div
              className={`relative overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 ${
                isMobile ? "size-[3.25rem]" : compactEmbedded ? "size-12" : "size-14"
              }`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-xs font-black text-zinc-500">
                  {(item?.title ?? "—").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {biddingWindowOpen ? (
              <span
                className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/90 text-[8px] font-black text-white shadow-[0_0_12px_rgba(16,185,129,0.65)] motion-safe:animate-pulse"
                aria-hidden
              >
                ●
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className={`flex flex-wrap items-center gap-1 ${compactEmbedded ? "" : "gap-1.5"}`}>
              <span className="rounded-sm border border-white/10 bg-black/40 px-1.5 py-[2px] text-[8px] font-black uppercase tracking-[0.14em] text-zinc-300">
                On the block
              </span>
              {item?.listingId ? (
                <span className="rounded-sm border border-sky-400/25 bg-sky-500/15 px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide text-sky-100/95">
                  Vault auth
                </span>
              ) : compactEmbedded ? null : (
                <span className="rounded-sm border border-zinc-600/40 bg-zinc-800/60 px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide text-zinc-400">
                  Floor lot
                </span>
              )}
              {!compactEmbedded ? (
                <span className="rounded-sm border border-amber-400/20 bg-amber-500/10 px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide text-amber-100/90">
                  Ship: vault standard
                </span>
              ) : null}
            </div>
            <p
              className={`mt-0.5 line-clamp-2 text-left font-semibold leading-snug text-white ${
                isMobile ? "text-[11px]" : compactEmbedded ? "text-[13px]" : "text-sm"
              }`}
            >
              {item ? hostQueueTitleLine(item) : "No lot pinned"}
              {item ? <span className="font-normal text-zinc-500"> · #{item.sortOrder}</span> : null}
            </p>
            {item ? (
              <p className={`mt-1 text-left font-semibold text-amber-100/95 ${compactEmbedded ? "text-[10px]" : "text-[11px]"}`}>
                {formatAuctionLeaderLine({
                  lastHighBidderUsername: item.lastHighBidderUsername,
                  lastHighBidderId: item.lastHighBidderId,
                  currentBidUsd: item.currentBidUsd,
                  startingBidUsd: item.startingBidUsd,
                  priceUsd: item.priceUsd,
                })}
              </p>
            ) : null}
            {!compactEmbedded ? (
              <p className="mt-1 line-clamp-2 text-left text-[10px] leading-relaxed text-zinc-400">
                {item?.teamBoardMisc
                  ? "Host note: MISC spot flagged for team board."
                  : "Seller note: lean into the story — authenticity and comps land bids."}
              </p>
            ) : null}
            {!isMobile && !compactEmbedded ? (
              <BidVelocityBar
                biddingOpen={Boolean(biddingWindowOpen && activeBoardRow?.item.biddingOpen)}
                endsAt={activeBoardRow?.item.auctionEndsAt ?? null}
                clockSkewMs={hostClockSkewMs}
              />
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              {overlayPrice?.label ?? "Opening bid"}
            </p>
            <p
              className={`font-mono font-black tabular-nums text-white tracking-tight ${
                isMobile ? "text-base" : compactEmbedded ? "text-base" : embedded ? "text-lg" : "text-xl"
              }`}
            >
              {overlayPrice?.amountFormatted ?? "—"}
            </p>
            {item?.priceUsd != null && Number.isFinite(item.priceUsd) ? (
              <p className="mt-0.5 text-[8px] font-semibold text-zinc-400">
                Reserve{" "}
                {reserveMet === true ? (
                  <span className="text-emerald-300/95">met</span>
                ) : reserveMet === false ? (
                  <span className="text-amber-200/90">open</span>
                ) : (
                  "—"
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-[8px] text-zinc-600">No reserve</p>
            )}
            {!compactEmbedded ? (
              <p className="mt-1 text-[9px] font-semibold text-zinc-500">
                <span className="text-zinc-400">{viewerCount}</span> watching
              </p>
            ) : null}
            {hostAuctionCountdownLabel ? (
              <p className="mt-1 inline-flex items-center justify-end gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-emerald-100 shadow-[0_0_16px_-6px_rgba(16,185,129,0.55)]">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                {hostAuctionCountdownLabel}
              </p>
            ) : null}
          </div>
        </div>

        {activeBoardRow ? (
          <div className={`relative border-t border-white/[0.07] bg-black/40 px-2.5 ${compactEmbedded ? "py-1.5" : "px-3 py-2 max-[380px]:px-2.5"}`}>
            {activeBoardRow.item.status === "sold" ? (
              <p className="text-center text-[11px] font-bold uppercase tracking-wide text-emerald-300/95">
                Lot sold
                {activeBoardRow.item.lastHighBidderUsername?.trim()
                  ? ` · @${activeBoardRow.item.lastHighBidderUsername.trim()} · ${formatAuctionMoneyUsd(activeBoardRow.item.currentBidUsd)}`
                  : ""}
              </p>
            ) : activeBoardRow.item.status === "skipped" ? (
              <p className="text-center text-[11px] font-bold uppercase tracking-wide text-zinc-400">Lot skipped</p>
            ) : biddingWindowOpen ? (
              <div className={`flex flex-wrap items-center gap-2 ${isMobile ? "justify-center" : "justify-between"}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-100">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                  Auction running
                </span>
                {hostAuctionCountdownLabel ? (
                  <span className="text-[11px] font-black tabular-nums text-amber-100">{hostAuctionCountdownLabel}</span>
                ) : null}
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {overlayPrice?.amountFormatted ?? "—"}
                </span>
              </div>
            ) : roomStatusLive ? (
              <div className={`flex flex-col gap-2 ${isMobile ? "items-stretch" : ""}`}>
                <div className={`flex flex-wrap items-center gap-2 ${isMobile ? "justify-center" : "justify-between"}`}>
                  <label className={`flex items-center gap-2 text-zinc-400 ${isMobile ? "text-[9px]" : "text-[10px]"}`}>
                    <span className="font-bold uppercase tracking-wide">Clock</span>
                    <select
                      value={hostAuctionDurationSec}
                      onChange={(e) => onHostAuctionDurationSec(Number(e.target.value))}
                      className="rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold text-zinc-100"
                    >
                      {[5, 10, 15, 20, 30].map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}s
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-pressed={hostClutchTimeEnabled}
                    onClick={onToggleClutch}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide transition ${
                      hostClutchTimeEnabled
                        ? "border-fuchsia-300/60 bg-gradient-to-r from-fuchsia-500/20 via-violet-500/20 to-amber-400/20 text-white"
                        : "border-white/15 bg-black/40 text-zinc-400"
                    }`}
                  >
                    Sudden death
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!hostStartLiveAuctionEnabled || hostLiveItemAuctionBusy}
                  onClick={onStartAuction}
                  className={`w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-200 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_24px_-8px_rgba(251,191,36,0.85)] disabled:opacity-40 ${isMobile ? "py-2" : ""}`}
                >
                  {hostLiveItemAuctionBusy ? "Starting…" : "Start Auction"}
                </button>
              </div>
            ) : (
              <p className="text-center text-[10px] text-amber-200/90">Go live to start the auction.</p>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  const wrapClass = isMobile
    ? "relative w-full max-w-[100vw] rounded-2xl p-px motion-safe:animate-[live-stage-mobile-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:animate-none"
    : embedded
      ? "relative w-full rounded-xl p-px"
      : "relative w-full rounded-2xl p-px";

  return <div className={wrapClass}>{shell}</div>;
}
