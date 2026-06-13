import Link from "next/link";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";

type MarketplaceProductCardProps = {
  title: string;
  condition: string;
  seller: string;
  price: number;
  seed: string;
  href?: string;
  compact?: boolean;
};

import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";
export function MarketplaceProductCard({
  title,
  condition,
  seller,
  price,
  seed,
  href = "#cart",
  compact,
}: MarketplaceProductCardProps) {
  return (
    <article
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-[0_14px_44px_-26px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-out hover:scale-105 hover:border-gold/45 hover:shadow-[0_28px_64px_-22px_rgba(201,162,39,0.32),0_0_40px_-10px_rgba(201,162,39,0.2)]`}
    >
      <div className="relative aspect-square w-full overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <CardImagePlaceholder seed={seed} variant="slab" boostProduct={!!compact} className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/5 via-transparent to-black/25 opacity-95" />
        <span className="absolute left-2 top-2 z-[2] rounded-md border border-gold/45 bg-black/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-bright shadow-[0_4px_18px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          {condition}
        </span>
      </div>

      <div
        className={`flex flex-1 flex-col border-t border-white/[0.08] bg-white/[0.025] backdrop-blur-md ${compact ? "gap-2.5 p-3" : "gap-3 p-3.5"}`}
      >
        <h3
          className={`line-clamp-2 font-bold leading-snug tracking-tight text-foreground group-hover:text-gold-bright ${compact ? "min-h-[2.25rem] text-[11px] sm:text-xs" : "min-h-[2.5rem] text-sm"}`}
        >
          {title}
        </h3>
        <p className={`text-zinc-500 ${compact ? "text-[10px]" : "text-xs"}`}>
          <span className="text-zinc-600">Seller </span>
          <span className="font-medium text-zinc-400">{seller}</span>
        </p>
        <div className={`mt-auto flex items-center justify-between gap-2 border-t border-white/5 ${compact ? "pt-3" : "pt-3.5"}`}>
          <p
            className={`font-mono font-black tracking-tight text-gold-bright ${compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"}`}
          >
            {formatMarketplaceUsd(price)}
          </p>
          <Link
            href={href}
            className={`flex shrink-0 items-center justify-center rounded-full border border-gold/45 bg-gradient-to-b from-gold to-gold-dim text-zinc-950 shadow-[0_0_22px_-4px_rgba(201,162,39,0.55)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_32px_-2px_rgba(232,212,139,0.5)] [&_svg]:text-zinc-950 ${compact ? "size-8" : "size-9"}`}
            aria-label="Add to cart"
          >
            <CartIcon className={compact ? "size-3.5" : "size-4"} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 3M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
