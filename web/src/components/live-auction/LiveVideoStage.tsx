"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LiveViewerCount } from "@/components/live-auction/LiveViewerCount";
import { LiveVideoStagePlayback } from "@/components/live-auction/LiveVideoStagePlayback";
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
  /** `aspect` (default): 16:9 plate. `fillHeight`: grow with parent height (e.g. host console column). */
  layout?: "aspect" | "fillHeight";
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
  /** Narrower auction/item overlay for 9:16 host console stage. */
  compactActionOverlay?: boolean;
  /** Extra controls in the top chrome row (before the Live / viewer cluster). */
  topChromeTrailing?: ReactNode;
  /** Buyer-only right-side quick actions. */
  showRightActions?: boolean;
  onShare?: () => void;
  onWallet?: () => void;
  /** When set, loads buyer-safe stream info and renders IVS HLS playback behind overlays (never exposes keys). */
  liveRoomId?: string;
  /** Bumped when room `stream_status` realtime fires so playback refetches stream info. */
  streamPlaybackRefreshNonce?: number;
  /** Room scheduled start (ISO) for pre-live buyer video messaging. */
  scheduledStartAt?: string | null;
  /** Host-uploaded room thumbnail; rendered behind standby/countdown UI until the live video paints. */
  thumbnailUrl?: string | null;
  /** DB room status — bottom playback pill uses this (Live / Upcoming / Ended). */
  roomStatus: LiveRoomStatus;
};

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
  stageBelowAudience,
  onNotifyMe,
  chatOverlay,
  chatOverlayClassName,
  sellerHostRail,
  hostRailClassName,
  compactActionOverlay = false,
  topChromeTrailing,
  showRightActions = false,
  onShare,
  onWallet,
  liveRoomId,
  streamPlaybackRefreshNonce,
  scheduledStartAt = null,
  thumbnailUrl = null,
  roomStatus,
}: LiveVideoStageProps) {
  const avatarLabel = hostName.charAt(0).toUpperCase();
  const statusLabel =
    roomStatus === "ended" ? "Ended" : isLive ? "Live" : startsIn ? `Starts in ${startsIn}` : "Upcoming";
  /** Anchored bottom item sheet (auction/buy bar) — lifts chat + right rail so they clear the panel. */
  const hasMobileItemSheet = Boolean(mobileActionOverlay);
  const rootClass =
    layout === "fillHeight"
      ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black"
      : "relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden rounded-none bg-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] md:aspect-video md:h-auto md:min-h-[calc(56.25vw*1.4)] md:rounded-2xl md:border md:border-zinc-800";

  return (
    <div className={rootClass}>
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(250,204,21,0.08), transparent 45%), radial-gradient(circle at 80% 70%, rgba(63,63,70,0.4), transparent 50%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/34 via-black/10 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/68 via-black/26 to-transparent" aria-hidden />
      {liveRoomId ? (
        <LiveVideoStagePlayback
          liveRoomId={liveRoomId}
          roomLifecycleLive={isLive}
          streamPlaybackRefreshNonce={streamPlaybackRefreshNonce}
          scheduledStartAt={scheduledStartAt}
          thumbnailUrl={thumbnailUrl}
        />
      ) : null}
      <div
        className={
          layout === "fillHeight"
            ? "pointer-events-none flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8"
            : "pointer-events-none absolute inset-0 flex items-center justify-center"
        }
      >
        {!isLive && !liveRoomId ? (
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
        ) : null}
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" aria-hidden />

      {centerOverlay ? (
        <div
          className={`pointer-events-none absolute inset-0 ${centerOverlayOnTop ? "z-[40]" : "z-[8]"} flex items-center justify-center p-2 sm:p-4`}
        >
          <div className="pointer-events-auto max-h-full min-h-0 w-full max-w-[1920px] overflow-y-auto">{centerOverlay}</div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-1.5 right-1.5 top-[max(0.35rem,env(safe-area-inset-top))] z-10 flex flex-col items-stretch gap-1 md:left-2 md:right-2 md:top-2 md:gap-2">
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
        {stageBelowAudience ? (
          <div className="pointer-events-auto flex justify-end pr-0.5">{stageBelowAudience}</div>
        ) : null}
      </div>

      {actionOverlay ? (
        <div
          className={`absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 min-[1400px]:block ${
            compactActionOverlay
              ? "w-[min(94%,100%)] min-w-0 max-w-full px-1"
              : "w-[min(72%,700px)] min-w-[320px]"
          }`}
        >
          {actionOverlay}
        </div>
      ) : null}

      {mobileActionOverlay ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 min-[1400px]:hidden">
          <div className="pointer-events-auto motion-reduce:animate-none [animation:live-stage-mobile-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none]">
            {mobileActionOverlay}
          </div>
        </div>
      ) : null}
      {chatOverlay ? (
        <div
          className={`absolute left-1.5 z-10 flex w-[min(96vw,34rem)] min-h-0 max-h-[min(54dvh,28rem)] min-w-0 flex-col max-[380px]:left-1 max-[380px]:w-[min(94vw,26rem)] transition-opacity duration-[var(--live-duration-ui)] ease-[var(--live-ease)] min-[1400px]:bottom-7 min-[1400px]:left-3 min-[1400px]:max-h-[min(70vh,32rem)] min-[1400px]:w-[min(48vw,32rem)] ${
            hasMobileItemSheet
              ? "bottom-[max(8.25rem,calc(env(safe-area-inset-bottom)+7.5rem))]"
              : "bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))]"
          } ${chatOverlayClassName ?? ""}`}
        >
          {chatOverlay}
        </div>
      ) : null}

      {sellerHostRail ? (
        <div
          className={`absolute right-2 z-10 min-[1400px]:right-3 min-[1400px]:top-[46%] min-[1400px]:bottom-auto min-[1400px]:-translate-y-1/2 ${
            hasMobileItemSheet
              ? "bottom-[max(17.25rem,calc(env(safe-area-inset-bottom)+15.75rem))]"
              : "bottom-[max(7.25rem,calc(env(safe-area-inset-bottom)+6.25rem))]"
          } ${hostRailClassName ?? ""}`}
        >
          {sellerHostRail}
        </div>
      ) : showRightActions ? (
        <div
          className={`absolute right-2 z-10 min-[1400px]:right-3 min-[1400px]:top-[46%] min-[1400px]:bottom-auto min-[1400px]:-translate-y-1/2 ${
            hasMobileItemSheet
              ? "bottom-[max(17.25rem,calc(env(safe-area-inset-bottom)+15.75rem))]"
              : "bottom-[max(7.25rem,calc(env(safe-area-inset-bottom)+6.25rem))]"
          }`}
        >
          <div className="motion-reduce:animate-none flex flex-col items-center gap-1 max-[380px]:gap-0.5 rounded-2xl border border-[color:var(--live-border)] bg-black/18 px-1 py-1.5 backdrop-blur-[var(--live-blur-xl)] shadow-[var(--live-shadow-rail)] [animation:live-rail-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none] md:gap-1.5 md:px-1.5 md:py-2">
            <ActionPill label="Share" icon={<ShareIcon />} onClick={onShare} />
            <ActionPill label="Wallet" icon={<WalletIcon />} onClick={onWallet} />
            <ActionPill label="Shop" icon={<ShopIcon />} href="/marketplace" />
          </div>
        </div>
      ) : null}
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
