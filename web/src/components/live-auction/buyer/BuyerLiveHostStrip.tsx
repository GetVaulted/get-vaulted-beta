"use client";

import Link from "next/link";
import { LiveViewerCount } from "@/components/live-auction/LiveViewerCount";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { ReportTrigger } from "@/components/trust/ReportModal";
import type { LiveRoomStatus } from "@/generated/prisma/client";

export type BuyerLiveHostStripProps = {
  hostName: string;
  streamTitle?: string;
  hostSellerId?: string;
  viewers: number;
  isLive: boolean;
  roomStatus: LiveRoomStatus;
  startsIn?: string;
  liveRoomId: string;
  shopHref?: string | null;
  onBack?: () => void;
  onShare?: () => void;
  onWallet?: () => void;
  onTip?: () => void;
};

export function BuyerLiveHostStrip({
  hostName,
  streamTitle,
  hostSellerId,
  viewers,
  isLive,
  roomStatus,
  startsIn = "",
  liveRoomId,
  shopHref,
  onBack,
  onShare,
  onWallet,
  onTip,
}: BuyerLiveHostStripProps) {
  const avatarLabel = hostName.charAt(0).toUpperCase();
  const statusLabel =
    roomStatus === "ended" ? "Ended" : isLive ? "Live" : startsIn ? `Starts in ${startsIn}` : "Upcoming";

  return (
    <div className="shrink-0 border-b border-zinc-800/80 px-3 py-2.5">
      <div className="flex items-start gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 transition hover:bg-zinc-800"
            aria-label="Back"
          >
            ←
          </button>
        ) : null}
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-black text-zinc-100">
          {avatarLabel}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-bold text-zinc-100">{hostName}</p>
            {hostSellerId ? <SellerFollowButton sellerUserId={hostSellerId} variant="overlay" /> : null}
            <span
              data-testid="live-status-pill"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white ${
                isLive ? "bg-red-600 ring-1 ring-red-400/40" : "bg-zinc-700/90"
              }`}
            >
              {isLive ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
              {statusLabel}
            </span>
            <LiveViewerCount viewers={viewers} isLive={isLive} />
          </div>
          {streamTitle ? <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">{streamTitle}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {onTip ? (
          <button
            type="button"
            onClick={onTip}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:border-gold/40"
          >
            Tip
          </button>
        ) : null}
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:border-gold/40"
          >
            Share
          </button>
        ) : null}
        {onWallet ? (
          <button
            type="button"
            onClick={onWallet}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:border-gold/40"
          >
            Wallet
          </button>
        ) : null}
        {shopHref ? (
          <Link
            href={shopHref}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-gold-bright hover:border-gold/40"
          >
            Shop
          </Link>
        ) : null}
        <ReportTrigger
          targetType="live_room"
          targetId={liveRoomId}
          liveRoomId={liveRoomId}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-300 hover:border-zinc-600"
        />
      </div>
    </div>
  );
}
