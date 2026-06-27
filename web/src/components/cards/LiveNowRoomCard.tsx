"use client";

import Link from "next/link";
import type { LiveNowRoom } from "@/content/live-rooms";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";
import { getLiveCardSignals, getStreamTypeBadge } from "@/lib/live-signals";

type LiveNowRoomCardProps = {
  room: LiveNowRoom;
  featured?: boolean;
  dynamicSignals?: { primary: string; secondary: string };
  muted?: boolean;
};

function formatInt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;
}

const tagTone: Record<string, string> = {
  Break: "border-sky-300/20 bg-sky-950/22 text-sky-100/90",
  Auction: "border-fuchsia-300/20 bg-fuchsia-950/20 text-fuchsia-100/90",
  Sale: "border-emerald-300/20 bg-emerald-950/20 text-emerald-100/90",
  Buy: "border-amber-300/20 bg-amber-950/20 text-amber-100/90",
  Replay: "border-cyan-300/20 bg-cyan-950/20 text-cyan-100/90",
};

export function LiveNowRoomCard({ room, featured = false, dynamicSignals, muted = false }: LiveNowRoomCardProps) {
  const tag = getStreamTypeBadge(room);
  const isLiveNow = room.status === "live_now";
  const chipLabel = isLiveNow ? formatInt(room.viewers) : "Scheduled";
  const signals = dynamicSignals ?? getLiveCardSignals(room);
  const featuredClass = featured
    ? "border-gold/35 shadow-[0_14px_34px_-22px_rgba(0,0,0,0.88),0_0_20px_-12px_rgba(201,162,39,0.32),inset_0_1px_0_rgba(255,255,255,0.06)]"
    : "border-white/10 shadow-[0_14px_34px_-22px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)]";
  const hoverClass = muted
    ? "hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-22px_rgba(0,0,0,0.86),0_0_16px_-12px_rgba(201,162,39,0.18)]"
    : "hover:-translate-y-1 hover:shadow-[0_24px_54px_-20px_rgba(0,0,0,0.9),0_0_22px_-14px_rgba(201,162,39,0.24)]";

  return (
    <Link
      href={room.href}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-[#0b0b0e] transition-all duration-300 ease-out ${hoverClass} ${featuredClass}`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-white/[0.04]">
        <div className="absolute inset-0 z-0">
          {room.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={room.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CardImagePlaceholder seed={room.imageSeed} variant="slab" className="h-full w-full" />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/36 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/12 via-transparent to-transparent" />

        <div className="absolute left-2 top-2 z-[2] inline-flex items-center gap-1.5">
          <span
            className={`inline-flex h-6 max-w-[calc(100%-0.5rem)] items-center rounded-md border px-2 text-[8px] font-black uppercase tracking-wide shadow-[0_4px_18px_rgba(0,0,0,0.35)] sm:px-2.5 sm:text-[9px] ${
              tagTone[tag.split(" - ")[0] ?? tag] ?? tagTone.Sale
            }`}
          >
            {tag}
          </span>
        </div>

        <span className="absolute right-2 top-2 z-[2] inline-flex h-6 items-center rounded-md border border-white/18 bg-white/[0.1] px-2.5 text-[9px] font-semibold tabular-nums text-zinc-100 shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-lg">
          {chipLabel}
        </span>

      </div>

      <div className="flex flex-1 flex-col border-t border-white/[0.06] bg-white/[0.02] px-2.5 pb-2.5 pt-2 backdrop-blur-md">
        <h3 className="line-clamp-2 text-[11px] font-bold leading-tight tracking-tight text-foreground group-hover:text-gold-bright sm:text-xs">
          {room.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-zinc-200">{signals.primary}</p>
        <p className="mt-0.5 line-clamp-1 text-[9px] text-zinc-400">{signals.secondary}</p>
      </div>
    </Link>
  );
}
