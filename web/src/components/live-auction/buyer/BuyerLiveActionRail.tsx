"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ReportTrigger } from "@/components/trust/ReportModal";

export type BuyerLiveActionRailProps = {
  liveRoomId: string;
  /** Opens the in-room shop / lineup (not the seller marketplace profile). */
  onShop?: () => void;
  /** Optional fallback link when `onShop` is not provided. */
  shopHref?: string | null;
  onShare: () => void;
  onWallet: () => void;
  onTip?: () => void;
  /** Horizontal strip for the item board; vertical stack for mobile overlays. */
  layout?: "row" | "column";
};

/** Tip / share / wallet / shop / report — desktop item board or mobile stage overlay. */
export function BuyerLiveActionRail({
  liveRoomId,
  onShop,
  shopHref,
  onShare,
  onWallet,
  onTip,
  layout = "row",
}: BuyerLiveActionRailProps) {
  const wrapClass =
    layout === "row"
      ? "flex flex-wrap items-center gap-1"
      : "flex flex-col items-center gap-1 rounded-2xl border border-[color:var(--live-border)] bg-black/18 px-1 py-1.5 backdrop-blur-[var(--live-blur-xl)]";

  return (
    <div className={wrapClass}>
      {onTip ? <ActionPill label="Tip" icon={<TipIcon />} onClick={onTip} compact={layout === "row"} /> : null}
      <ActionPill label="Share" icon={<ShareIcon />} onClick={onShare} compact={layout === "row"} />
      <ActionPill label="Wallet" icon={<WalletIcon />} onClick={onWallet} compact={layout === "row"} />
      <ActionPill
        label="Shop"
        icon={<ShopIcon />}
        onClick={onShop}
        href={onShop ? undefined : shopHref ?? undefined}
        compact={layout === "row"}
      />
      <ReportTrigger
        targetType="live_room"
        targetId={liveRoomId}
        liveRoomId={liveRoomId}
        className={
          layout === "row"
            ? "group inline-flex min-h-9 items-center gap-1 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
            : "group inline-flex min-h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-0.5 py-1 text-white/90 backdrop-blur-[var(--live-blur-md)] transition hover:bg-white/[0.07] md:min-h-11 md:min-w-11"
        }
      >
        {layout === "row" ? (
          <>
            <FlagIcon />
            <span>Report</span>
          </>
        ) : (
          <>
            <span className="inline-flex size-4 items-center justify-center">
              <FlagIcon />
            </span>
            <span className="text-[9px] font-semibold leading-none text-zinc-200">Report</span>
          </>
        )}
      </ReportTrigger>
    </div>
  );
}

function ActionPill({
  label,
  icon,
  disabled = false,
  href,
  onClick,
  compact = false,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const classes = compact
    ? "group inline-flex min-h-9 items-center gap-1 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-35"
    : "group inline-flex min-h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.02] px-0.5 py-1 text-white/90 backdrop-blur-[var(--live-blur-md)] transition hover:-translate-y-0.5 hover:bg-white/[0.07] active:scale-[0.94] disabled:opacity-35 md:min-h-11 md:min-w-11";

  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {compact ? (
          <>
            <span className="inline-flex size-3.5 items-center justify-center">{icon}</span>
            {label}
          </>
        ) : (
          <>
            <span className="inline-flex size-4 items-center justify-center">{icon}</span>
            <span className="text-[9px] font-semibold leading-none text-zinc-200">{label}</span>
          </>
        )}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={classes}>
      {compact ? (
        <>
          <span className="inline-flex size-3.5 items-center justify-center">{icon}</span>
          {label}
        </>
      ) : (
        <>
          <span className="inline-flex size-4 items-center justify-center">{icon}</span>
          <span className="text-[9px] font-semibold leading-none text-zinc-200">{label}</span>
        </>
      )}
    </button>
  );
}

function TipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M8 7h8M9 11h6" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12v6a1 1 0 001 1h8a1 1 0 001-1v-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-3 3m3-3l3 3" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h14a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h4" />
      <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9l1-4h14l1 4M5 9h14v10H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h12l-2 3 2 3H5" />
    </svg>
  );
}
