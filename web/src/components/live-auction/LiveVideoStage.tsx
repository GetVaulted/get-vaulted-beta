"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LiveViewerCount } from "@/components/live-auction/LiveViewerCount";
import { LiveVideoStagePlayback } from "@/components/live-auction/LiveVideoStagePlayback";
import { LiveStageAmbientBleed } from "@/components/live-stage/LiveStageAmbientBleed";
import { LiveStageLighting } from "@/components/live-stage/LiveStageLighting";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";
import { ReportTrigger } from "@/components/trust/ReportModal";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import type { LiveRoomStatus } from "@/generated/prisma/client";

type LiveVideoStageProps = {
  overlayMessage: string;
  viewers?: number;
  hostName?: string;
  streamTitle?: string;
  hostRating?: string;
  hostVerified?: boolean;
  isLive?: boolean;
  startsIn?: string;
  onBack?: () => void;
  /** When set, host row shows a working Follow control for this seller user id. */
  hostSellerId?: string;
  /** Centered overlay above the video plate (e.g. break team board). Keeps top/bottom chrome usable. */
  centerOverlay?: ReactNode;
  /** When true, render center overlay above all stream chrome (e.g. active team board). */
  centerOverlayOnTop?: boolean;
  actionOverlay?: ReactNode;
  mobileActionOverlay?: ReactNode;
  /** `fillHeight`: grow with parent. `host916`: legacy alias — video stays 9:16, overlays use full stage on desktop. `buyerShellPlate`: 9:16 plate centered in parent (buyer desktop shell). */
  layout?: "aspect" | "fillHeight" | "host916" | "buyerShellPlate";
  /** Buyer /live desktop shell (≥1280px): video only on desktop; overlays stay on mobile. */
  buyerShellMode?: boolean;
  /** Shown below the Live / audience row, right-aligned (e.g. host team board control). */
  stageBelowAudience?: ReactNode;
  /** Optional mobile CTA for upcoming streams. */
  onNotifyMe?: () => void;
  /** Floating chat (right/bottom) overlay. */
  chatOverlay?: ReactNode;
  /** Optional class names on the chat overlay positioning wrapper. */
  chatOverlayClassName?: string;
  /** Seller/host right-side quick rail (e.g. Vault Command Center). Takes precedence over buyer actions when set. */
  sellerHostRail?: ReactNode;
  /** Optional class names on the host rail positioning wrapper. */
  hostRailClassName?: string;
  /** Stacked action buttons on the right edge of the video frame (desktop host dashboard). */
  stageEdgeRail?: ReactNode;
  /** Narrower auction/item overlay for 9:16 host console stage. */
  compactActionOverlay?: boolean;
  /** Floating HUD spans stage container (wider than 9:16 video). */
  cinematicActionOverlay?: boolean;
  /** Compact, centered auction bar capped near the 9:16 video width (PC seller console). */
  centeredActionOverlay?: boolean;
  /** Extra controls in the top chrome row (before the Live / viewer cluster). */
  topChromeTrailing?: ReactNode;
  /** Buyer-only right-side quick actions. */
  showRightActions?: boolean;
  /** Seller shop link for the video-stage Shop action. */
  shopHref?: string | null;
  onShare?: () => void;
  onWallet?: () => void;
  /** Opens buyer tip sheet — shown on the right rail when the show is live. */
  onTip?: () => void;
  /** Buyer giveaway ghost tab + expand panel (left edge of stage). */
  giveawaySideTab?: ReactNode;
  /** When set, loads buyer-safe stream info and renders IVS HLS playback behind overlays (never exposes keys). */
  liveRoomId?: string;
  /** Ambient bottom glow intensity 0–100 (room energy). Desktop host stage. */
  stageEnergyScore?: number;
  /** Full-stage blurred video/thumbnail bleed behind 9:16 plate. */
  ambientBleed?: boolean;
  /** Cinematic overlays on full stage (lot transitions). */
  stageOverlay?: ReactNode;
  /** Bumped when room `stream_status` realtime fires so playback refetches stream info. */
  streamPlaybackRefreshNonce?: number;
  /** Signed-in buyer — enables WebRTC stage subscribe; guests use HLS fallback. */
  viewerAuthenticated?: boolean;
  /** Room scheduled start (ISO) for pre-live buyer video messaging. */
  scheduledStartAt?: string | null;
  /** Host-uploaded room thumbnail; rendered behind standby/countdown UI until the live video paints. */
  thumbnailUrl?: string | null;
  /** When true, video/thumbnail fill the stage edge-to-edge (host 9:16 console frame). */
  fillPortraitFrame?: boolean;
  /** DB room status — bottom playback pill uses this (Live / Upcoming / Ended). */
  roomStatus: LiveRoomStatus;
  /** Host stage mood — drives spotlight tint and ambient motion. */
  vaultMode?: VaultMode;
  vaultEnergyLevel?: LiveRoomEnergyLevel;
  /** Fade chrome when stage is idle. */
  uiDimmed?: boolean;
};

/** Centered 9:16 plate — video only; overlays attach to outer stage on desktop. */
const PORTRAIT_VIDEO_FRAME =
  "relative aspect-[9/16] min-h-0 shrink-0 overflow-hidden min-[1400px]:rounded-xl min-[1400px]:border min-[1400px]:border-white/[0.14] min-[1400px]:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.92)]";
const PORTRAIT_VIDEO_FRAME_BUYER_SHELL =
  "relative aspect-[9/16] min-h-0 shrink-0 overflow-hidden min-[1280px]:rounded-xl min-[1280px]:border min-[1280px]:border-white/[0.14] min-[1280px]:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.92)]";

export function LiveVideoStage({
  overlayMessage,
  viewers = 0,
  hostName = "Host",
  streamTitle = "",
  hostRating,
  hostVerified = false,
  isLive = true,
  startsIn = "",
  onBack,
  hostSellerId,
  centerOverlay,
  centerOverlayOnTop = false,
  actionOverlay,
  mobileActionOverlay,
  layout = "aspect",
  buyerShellMode = false,
  stageBelowAudience,
  onNotifyMe,
  chatOverlay,
  chatOverlayClassName,
  sellerHostRail,
  hostRailClassName,
  stageEdgeRail,
  compactActionOverlay = false,
  cinematicActionOverlay = false,
  centeredActionOverlay = false,
  topChromeTrailing,
  showRightActions = false,
  shopHref = null,
  onShare,
  onWallet,
  onTip,
  giveawaySideTab,
  liveRoomId,
  stageEnergyScore = 0,
  ambientBleed = false,
  stageOverlay,
  streamPlaybackRefreshNonce,
  viewerAuthenticated = false,
  scheduledStartAt = null,
  thumbnailUrl = null,
  fillPortraitFrame: _fillPortraitFrameProp,
  roomStatus,
  vaultMode = "auction_night",
  vaultEnergyLevel = "calm",
  uiDimmed = false,
}: LiveVideoStageProps) {
  const avatarLabel = hostName.charAt(0).toUpperCase();
  const statusLabel =
    roomStatus === "ended" ? "Ended" : isLive ? "Live" : startsIn ? `Starts in ${startsIn}` : "Upcoming";
  /** Anchored bottom item sheet (auction/buy bar) — lifts chat + right rail so they clear the panel. */
  const hasMobileItemSheet = Boolean(mobileActionOverlay);
  const fillsParentHeight = layout === "fillHeight" || layout === "host916" || layout === "buyerShellPlate";
  const buyerShellPlateLayout = layout === "buyerShellPlate";
  const rootClass =
    buyerShellPlateLayout
      ? "relative h-full min-h-0 w-full overflow-hidden bg-black"
      : fillsParentHeight
        ? "relative h-full min-h-0 w-full overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black"
        : "relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden rounded-none bg-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] md:aspect-video md:h-auto md:min-h-[calc(56.25vw*1.4)] md:rounded-2xl md:border md:border-zinc-800";

  const portraitFrameClass = buyerShellPlateLayout
    ? "relative h-full w-full min-h-0 overflow-hidden min-[1280px]:rounded-xl min-[1280px]:border min-[1280px]:border-white/[0.14] min-[1280px]:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.92)]"
    : buyerShellMode
      ? PORTRAIT_VIDEO_FRAME_BUYER_SHELL
      : PORTRAIT_VIDEO_FRAME;

  const portraitSizingClass = buyerShellPlateLayout
    ? "h-full w-full"
    : fillsParentHeight
      ? "h-full max-h-full w-auto max-w-full"
      : "h-auto max-h-full w-full max-w-full";

  const mobileChromeHiddenClass = buyerShellMode ? "min-[1280px]:hidden" : "min-[1400px]:hidden";
  const desktopChromeHiddenClass = buyerShellMode ? "hidden min-[1280px]:block" : "hidden min-[1400px]:block";

  const desktopActionOverlayClass = buyerShellPlateLayout
    ? // Buyer desktop shell: full plate width, flush to bottom edge.
      "bottom-0 left-1/2 w-full max-w-full -translate-x-1/2"
    : cinematicActionOverlay
      ? "live-stage-hud-suspended bottom-4 left-1/2 w-[min(920px,calc(100%-3rem))] -translate-x-1/2"
      : centeredActionOverlay
        ? // Compact HUD overlaid on the bottom-center of the 9:16 video. Capped just under the
          // plate width (~540px at 1080p) so it floats on the video and never spans the stage.
          "bottom-4 left-1/2 w-[min(500px,calc(100%-2rem))] -translate-x-1/2"
        : compactActionOverlay
          ? "bottom-2 left-2 right-14"
          : "bottom-4 left-4 right-4";

  const hasDesktopItemSheet = buyerShellPlateLayout && Boolean(actionOverlay);
  const desktopChromeDimClass = uiDimmed ? "live-stage-ui-dimmed" : "live-stage-ui-awake";

  const topChrome = (
    <div className="pointer-events-auto flex items-start justify-between gap-1 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border-muted)] bg-[color:var(--live-chrome-fill)] px-1 py-0.5 backdrop-blur-[var(--live-blur-sm)] md:gap-1 md:px-1 md:py-0.5">
      <div className="flex min-w-0 items-center gap-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-black/45 text-[9px] font-semibold text-zinc-100 transition hover:bg-black/65"
          >
            ←
          </button>
        ) : null}
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-white/16 bg-zinc-900/75 text-[8px] font-black text-zinc-100">
          {avatarLabel}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-0.5">
            <p className="truncate text-[9px] font-bold text-zinc-100/95 max-[360px]:text-[8px]">{hostName}</p>
            {hostSellerId ? (
              <span className="inline-flex">
                <SellerFollowButton sellerUserId={hostSellerId} variant="overlay" />
              </span>
            ) : null}
            {hostVerified ? (
              <span className="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-400/12 px-1 py-[2px] text-[8px] font-bold text-sky-200/90 max-[360px]:text-[7px]">
                Verified
              </span>
            ) : null}
            {hostRating ? (
              <p className="hidden text-[10px] font-semibold text-zinc-300/90 sm:block">{"⭐ "}{hostRating}</p>
            ) : null}
          </div>
          {streamTitle ? <p className="truncate text-[9px] text-zinc-300/80">{streamTitle}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {topChromeTrailing}
        <span
          data-testid="live-status-pill"
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[8px] font-black uppercase tracking-wide text-white max-[360px]:text-[7px] ${
            isLive ? "bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.45)] ring-1 ring-red-400/50" : "bg-zinc-700/80"
          }`}
        >
          {isLive ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
          {statusLabel}
        </span>
        <LiveViewerCount viewers={viewers} isLive={isLive} />
      </div>
    </div>
  );

  const buyerRightRail = showRightActions ? (
    <div className="motion-reduce:animate-none flex flex-col items-center gap-1 max-[380px]:gap-0.5 rounded-2xl border border-[color:var(--live-border)] bg-black/18 px-1 py-1.5 backdrop-blur-[var(--live-blur-xl)] shadow-[var(--live-shadow-rail)] [animation:live-rail-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none] md:gap-1.5 md:px-1.5 md:py-2">
      {onTip ? <ActionPill label="Tip" icon={<TipIcon />} onClick={onTip} /> : null}
      <ActionPill label="Share" icon={<ShareIcon />} onClick={onShare} />
      <ActionPill label="Premium" icon={<WalletIcon />} onClick={onWallet} />
      <ActionPill label="Shop" icon={<ShopIcon />} href={shopHref ?? "/marketplace"} />
      {liveRoomId ? (
        <ReportTrigger
          targetType="live_room"
          targetId={liveRoomId}
          liveRoomId={liveRoomId}
          className="group inline-flex min-h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-0.5 py-1 text-white/90 backdrop-blur-[var(--live-blur-md)] transition-[transform,background-color,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:-translate-y-0.5 hover:bg-white/[0.07] active:scale-[0.94] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 md:min-h-11 md:min-w-11 md:px-1 md:py-1.5"
        >
          <span className="inline-flex size-4 items-center justify-center">
            <FlagIcon />
          </span>
          <span className="text-[9px] font-semibold leading-none text-zinc-200">Report</span>
        </ReportTrigger>
      ) : null}
    </div>
  ) : null;

  const mobileChatClass = `absolute left-1.5 z-10 flex w-[min(96vw,34rem)] min-h-0 max-h-[min(54dvh,28rem)] min-w-0 flex-col max-[380px]:left-1 max-[380px]:w-[min(94vw,26rem)] transition-opacity duration-[var(--live-duration-ui)] ease-[var(--live-ease)] ${
    hasMobileItemSheet
      ? "bottom-[max(8.25rem,calc(env(safe-area-inset-bottom)+7.5rem))]"
      : "bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))]"
  } ${chatOverlayClassName ?? ""}`;

  const desktopChatClass = `absolute bottom-7 left-3 z-10 flex w-[min(48vw,32rem)] min-h-0 max-h-[min(70vh,32rem)] min-w-0 flex-col transition-opacity duration-[var(--live-duration-ui)] ease-[var(--live-ease)] ${chatOverlayClassName ?? ""}`;

  const mobileHostRailClass = `absolute right-2 z-10 ${
    hasMobileItemSheet
      ? "bottom-[max(17.25rem,calc(env(safe-area-inset-bottom)+15.75rem))]"
      : "bottom-[max(7.25rem,calc(env(safe-area-inset-bottom)+6.25rem))]"
  } ${hostRailClassName ?? ""}`;

  return (
    <div className={rootClass} data-live-stage-root>
      {ambientBleed ? (
        <LiveStageAmbientBleed thumbnailUrl={thumbnailUrl} energyScore={stageEnergyScore} />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(250,204,21,0.06), transparent 45%), radial-gradient(circle at 80% 70%, rgba(63,63,70,0.35), transparent 50%)",
          }}
          aria-hidden
        />
      )}

      {stageOverlay ? (
        <div className={buyerShellMode ? "pointer-events-none absolute inset-0 z-[12] hidden min-[1280px]:block" : "pointer-events-none absolute inset-0 z-[12] hidden min-[1400px]:block"}>{stageOverlay}</div>
      ) : null}

      {/* 9:16 video plate — max area inside parent while preserving aspect ratio. */}
      <div
        className={`absolute inset-0 z-0 overflow-hidden ${buyerShellPlateLayout ? "[container-type:size]" : "flex items-center justify-center"}`}
      >
        {ambientBleed ? (
          <LiveStageLighting vaultMode={vaultMode} energyLevel={vaultEnergyLevel} energyScore={stageEnergyScore} />
        ) : null}
        <div className={`${portraitFrameClass} ${portraitSizingClass}`}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/34 via-black/10 to-transparent" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/68 via-black/26 to-transparent" aria-hidden />
          {liveRoomId ? (
            <LiveVideoStagePlayback
              liveRoomId={liveRoomId}
              roomLifecycleLive={isLive}
              viewerAuthenticated={viewerAuthenticated}
              streamPlaybackRefreshNonce={streamPlaybackRefreshNonce}
              scheduledStartAt={scheduledStartAt}
              thumbnailUrl={thumbnailUrl}
              fillPortraitFrame
            />
          ) : null}
          {!isLive && !liveRoomId ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-8">
              <div className="mx-4 w-full max-w-sm text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-bright/85">Live preview</p>
                <p className="mt-1 text-sm font-medium text-zinc-300">Stream preview will appear here</p>
                <button
                  type="button"
                  onClick={onNotifyMe}
                  className="pointer-events-auto mt-3 min-h-10 rounded-full border border-gold/40 bg-gold/20 px-4 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:bg-gold/30"
                >
                  Notify Me
                </button>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" aria-hidden />

          {centerOverlay ? (
            <div
              className={`pointer-events-none absolute inset-0 min-[1400px]:hidden ${centerOverlayOnTop ? "z-[40]" : "z-[8]"} flex items-center justify-center p-2 sm:p-4`}
            >
              <div className="pointer-events-auto max-h-full min-h-0 w-full max-w-full overflow-y-auto">{centerOverlay}</div>
            </div>
          ) : null}

          {/* Mobile / tablet overlays — constrained to the 9:16 video frame. */}
          <div className={`absolute inset-0 ${mobileChromeHiddenClass}`}>
            <div className="pointer-events-none absolute left-1.5 right-1.5 top-[max(0.35rem,env(safe-area-inset-top))] z-10 flex flex-col items-stretch gap-1 md:left-2 md:right-2 md:top-2 md:gap-2">
              {topChrome}
              {stageBelowAudience ? (
                <div className="pointer-events-auto flex justify-end pr-0.5">{stageBelowAudience}</div>
              ) : null}
            </div>

            {mobileActionOverlay ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
                <div className="pointer-events-auto motion-reduce:animate-none [animation:live-stage-mobile-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none]">
                  {mobileActionOverlay}
                </div>
              </div>
            ) : null}

            {chatOverlay ? <div className={mobileChatClass}>{chatOverlay}</div> : null}

            {giveawaySideTab ? (
              <div
                className={`pointer-events-none absolute left-0 z-[15] ${
                  hasMobileItemSheet
                    ? "top-[max(5.5rem,calc(env(safe-area-inset-top)+4.5rem))]"
                    : "top-1/2 -translate-y-1/2"
                }`}
              >
                {giveawaySideTab}
              </div>
            ) : null}

            {sellerHostRail ? <div className={mobileHostRailClass}>{sellerHostRail}</div> : buyerRightRail ? (
              <div
                className={`absolute right-2 z-10 ${
                  hasMobileItemSheet
                    ? "bottom-[max(17.25rem,calc(env(safe-area-inset-bottom)+15.75rem))]"
                    : "bottom-[max(7.25rem,calc(env(safe-area-inset-bottom)+6.25rem))]"
                }`}
              >
                {buyerRightRail}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {centerOverlay && !buyerShellMode ? (
        <div
          className={`pointer-events-none absolute inset-0 hidden min-[1400px]:flex ${centerOverlayOnTop ? "z-[40]" : "z-[8]"} items-center justify-center p-4`}
        >
          <div className="pointer-events-auto max-h-full min-h-0 w-full max-w-[1920px] overflow-y-auto">{centerOverlay}</div>
        </div>
      ) : null}

      {centerOverlay && buyerShellMode ? (
        <div
          className={`pointer-events-none absolute inset-0 hidden min-[1280px]:flex ${centerOverlayOnTop ? "z-[40]" : "z-[8]"} items-center justify-center p-2`}
        >
          <div className="pointer-events-auto max-h-full min-h-0 w-full max-w-md overflow-y-auto">{centerOverlay}</div>
        </div>
      ) : null}

      {/* Desktop overlays — full player / placecard stage, wider than the 9:16 video.
          Explicit z-10 lifts this whole layer above the z-0 video plate. The dim classes apply a
          CSS `filter`, which creates a stacking context pinned at the container's own z-index, so
          without this the HUD/controls would be trapped below the plate. Stays below the
          transition banner (z-[12]) so "SOLD"/next-lot moments still cover the HUD. */}
      <div className={`pointer-events-none absolute inset-0 z-10 ${desktopChromeHiddenClass} ${desktopChromeDimClass}`}>
        {!buyerShellMode ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-col items-stretch gap-2">
            {topChrome}
            {stageBelowAudience ? (
              <div className="pointer-events-auto flex justify-end">{stageBelowAudience}</div>
            ) : null}
          </div>
        ) : (
          <div className="pointer-events-none absolute left-3 right-14 top-3 z-10 flex justify-end">
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border-muted)] bg-[color:var(--live-chrome-fill)] px-2 py-1 backdrop-blur-[var(--live-blur-sm)]">
              <span
                data-testid="live-status-pill"
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[8px] font-black uppercase tracking-wide text-white ${
                  isLive ? "bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.45)] ring-1 ring-red-400/50" : "bg-zinc-700/80"
                }`}
              >
                {isLive ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
                {statusLabel}
              </span>
              <LiveViewerCount viewers={viewers} isLive={isLive} />
            </div>
          </div>
        )}

        {actionOverlay ? (
          <div className={`pointer-events-auto absolute z-10 live-stage-float-subtle ${desktopActionOverlayClass} ${uiDimmed ? "" : "live-stage-hud-awake"}`}>
            {actionOverlay}
          </div>
        ) : null}

        {chatOverlay ? <div className={`pointer-events-auto ${desktopChatClass}`}>{chatOverlay}</div> : null}

        {giveawaySideTab ? (
          <div className="pointer-events-none absolute left-0 top-1/2 z-[15] -translate-y-1/2">{giveawaySideTab}</div>
        ) : null}

        {stageEdgeRail ? (
          <div className="pointer-events-none absolute inset-y-8 right-3 z-20 flex items-center">
            <div className="pointer-events-auto">{stageEdgeRail}</div>
          </div>
        ) : null}

        {sellerHostRail ? (
          <div className={`pointer-events-auto absolute right-3 top-1/2 z-10 -translate-y-1/2 ${hostRailClassName ?? ""}`}>
            {sellerHostRail}
          </div>
        ) : buyerRightRail ? (
          <div
            className={`pointer-events-auto absolute right-3 z-10 ${
              hasDesktopItemSheet
                ? "bottom-[max(10.5rem,22%)]"
                : buyerShellPlateLayout
                  ? "top-1/2 -translate-y-1/2"
                  : "top-1/2 -translate-y-1/2"
            }`}
          >
            {buyerRightRail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionPill({
  label,
  icon,
  disabled = false,
  href,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const classes =
    "group inline-flex min-h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-0.5 py-1 text-white/90 backdrop-blur-[var(--live-blur-md)] transition-[transform,background-color,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:-translate-y-0.5 hover:bg-white/[0.07] active:scale-[0.94] disabled:opacity-35 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 md:min-h-11 md:min-w-11 md:px-1 md:py-1.5";

  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        <span className="inline-flex size-4 items-center justify-center">{icon}</span>
        <span className="text-[9px] font-semibold leading-none text-zinc-200">{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={classes}
    >
      <span className="inline-flex size-4 items-center justify-center">{icon}</span>
      <span className="text-[9px] font-semibold leading-none text-zinc-200">{label}</span>
    </button>
  );
}

function TipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M8 7h8M9 11h6" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12v6a1 1 0 001 1h8a1 1 0 001-1v-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-3 3m3-3l3 3" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h14a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h4" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9l1-4h14l1 4M5 9h14v10H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h12l-2 3 2 3H5" />
    </svg>
  );
}
