"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveBreak } from "@/content/home-page";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";

export type LiveBreakCardProps = LiveBreak & { href?: string };

function formatInt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;
}

function useAnimatedFill(fillRatio: number) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWidth(fillRatio);
      return;
    }
    const id = requestAnimationFrame(() => setWidth(fillRatio));
    return () => cancelAnimationFrame(id);
  }, [fillRatio]);
  return width;
}

export function LiveBreakCard(props: LiveBreakCardProps) {
  const { href = "/live", imageSeed, title, viewers } = props;
  const isAuction = props.breakType === "auction";

  const fillRatio =
    isAuction
      ? props.teamsTotal > 0
        ? props.teamsClaimed / props.teamsTotal
        : 0
      : props.spotsTotal > 0
        ? (props.spotsTotal - props.spotsLeft) / props.spotsTotal
        : 0;

  const barWidth = useAnimatedFill(fillRatio);

  const shellClass = isAuction
    ? "border-violet-500/25 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-violet-400/45 hover:shadow-[0_28px_80px_-24px_rgba(139,92,246,0.28),0_0_48px_-12px_rgba(139,92,246,0.2),0_12px_40px_-18px_rgba(0,0,0,0.85)]"
    : "border-white/10 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-gold/40 hover:shadow-[0_28px_80px_-24px_rgba(201,162,39,0.42),0_0_56px_-14px_rgba(201,162,39,0.28),0_12px_40px_-18px_rgba(0,0,0,0.85)]";

  const barGradient = isAuction
    ? "bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-500 shadow-[0_0_14px_rgba(139,92,246,0.45)]"
    : "bg-gradient-to-r from-live via-red-500 to-orange-400 shadow-[0_0_14px_rgba(239,68,68,0.4)]";

  let ctaLabel = "";
  let ctaClass = "";
  if (isAuction) {
    ctaLabel = props.ctaVerb === "enter_auction" ? "Enter Auction" : "View Teams";
    ctaClass =
      "border border-violet-400/35 bg-gradient-to-b from-violet-600/90 via-violet-700 to-violet-950 text-white shadow-[0_0_28px_-6px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(167,139,250,0.4)]";
  } else {
    ctaLabel = props.ctaVerb === "buy" ? `Buy Spot — $${props.pricePerSpot}` : `Join Break — $${props.pricePerSpot}`;
    ctaClass =
      "border border-transparent bg-gradient-to-r from-gold via-gold-bright to-gold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 hover:shadow-[0_0_44px_-4px_rgba(232,212,139,0.55)]";
  }

  const progressAria = isAuction
    ? {
        valuenow: props.teamsClaimed,
        valuemax: props.teamsTotal,
        label: `${props.teamsClaimed} of ${props.teamsTotal} teams claimed`,
      }
    : {
        valuenow: props.spotsTotal - props.spotsLeft,
        valuemax: props.spotsTotal,
        label: `${props.spotsLeft} of ${props.spotsTotal} spots remaining`,
      };

  return (
    <article
      className={`group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-[#0b0b0e] transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] ${shellClass}`}
    >
      <div className="relative aspect-video w-full overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <CardImagePlaceholder seed={imageSeed} variant="break" className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/85 via-black/45 to-black/40" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(135deg,rgba(0,0,0,0.55)_0%,transparent_42%,transparent_100%)]" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_90%_70%_at_50%_100%,rgba(0,0,0,0.5)_0%,transparent_55%)]" />
        {isAuction ? (
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(200deg,rgba(76,29,149,0.12)_0%,transparent_40%,transparent_100%)]" aria-hidden />
        ) : null}

        <span className="absolute left-2 top-2 z-10 inline-flex animate-[live-badge-pulse_2.4s_ease-in-out_infinite] items-center gap-1.5 rounded-md bg-live px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white ring-1 ring-red-300/55 shadow-[0_0_20px_rgba(220,38,38,0.45)]">
          <span
            className="size-1.5 animate-[live-dot-pulse_1.8s_ease-in-out_infinite] rounded-full bg-white shadow-[0_0_8px_white]"
            aria-hidden
          />
          Live
        </span>
        <div className="absolute right-2 top-2 z-10 rounded-full border border-white/30 bg-zinc-950/95 px-3 py-1.5 text-[10px] font-semibold tabular-nums text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-md">
          {formatInt(viewers)} watching
        </div>

        <span
          className={`absolute bottom-2 left-2 z-10 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md ${
            isAuction
              ? "border border-violet-400/40 bg-violet-950/90 text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.35)]"
              : "border border-white/15 bg-zinc-950/90 text-zinc-300 shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
          }`}
        >
          {isAuction ? "PYT Auction" : "Fixed price"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-white/[0.06] bg-[#08080a] p-3.5">
        <p className="text-[10px] font-bold leading-tight tracking-tight text-zinc-200">{props.urgencyHeadline}</p>
        <h3
          className={`line-clamp-2 text-xs font-bold leading-snug tracking-tight text-foreground sm:text-[13px] ${
            isAuction ? "group-hover:text-violet-200" : "group-hover:text-gold-bright"
          }`}
        >
          {title}
        </h3>

        {isAuction ? (
          <>
            <p className="text-[11px] font-semibold leading-snug text-violet-200/95">{props.priceLine}</p>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Teams claimed</p>
              <p className="text-[11px] font-semibold tabular-nums text-zinc-200">
                <span className="text-violet-300">{props.teamsClaimed}</span>
                <span className="text-zinc-500"> / </span>
                <span className="text-zinc-400">{props.teamsTotal}</span>
                <span className="font-medium text-zinc-500"> teams</span>
              </p>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.08] ring-1 ring-inset ring-violet-500/15"
                role="progressbar"
                aria-valuenow={progressAria.valuenow}
                aria-valuemin={0}
                aria-valuemax={progressAria.valuemax}
                aria-label={progressAria.label}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${barGradient}`}
                  style={{ width: `${barWidth * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] leading-snug text-zinc-400">{props.activityLine}</p>
            <p className="text-[10px] leading-snug text-zinc-500">{props.topBidLine}</p>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Spots left</p>
              <p className="text-[11px] font-semibold tabular-nums text-zinc-200">
                <span className="text-gold-bright">{props.spotsLeft}</span>
                <span className="text-zinc-500"> / </span>
                <span className="text-zinc-400">{props.spotsTotal}</span>
                <span className="font-medium text-zinc-500"> spots</span>
              </p>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/[0.05]"
                role="progressbar"
                aria-valuenow={progressAria.valuenow}
                aria-valuemin={0}
                aria-valuemax={progressAria.valuemax}
                aria-label={progressAria.label}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${barGradient}`}
                  style={{ width: `${barWidth * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] font-semibold text-zinc-400">
              <span className="text-zinc-500">Per spot</span>{" "}
              <span className="font-mono tabular-nums text-gold-bright">${props.pricePerSpot}</span>
            </p>
            <p className="text-[10px] leading-snug text-zinc-400">{props.recentSpotsLine}</p>
            <p className="text-[10px] leading-snug text-zinc-500">{props.lastHitLine}</p>
          </>
        )}

        <Link
          href={href}
          className={`mt-auto flex w-full items-center justify-center rounded-xl py-2.5 text-center text-[11px] font-black uppercase tracking-wide transition-all duration-200 ${ctaClass}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
