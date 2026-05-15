import Link from "next/link";

type MarketRowHeaderProps = {
  titleId?: string;
  title: string;
  livePulse?: boolean;
  actionLabel?: string;
  actionHref?: string;
};

export function MarketRowHeader({ titleId, title, livePulse, actionLabel, actionHref }: MarketRowHeaderProps) {
  return (
    <div className="mb-3 flex min-h-[2.125rem] items-center justify-between gap-3 border-b border-white/[0.07] pb-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {livePulse ? (
          <span
            className="size-2 shrink-0 animate-pulse rounded-full bg-live shadow-[0_0_16px_rgba(220,38,38,0.9),0_0_0_2px_rgba(255,255,255,0.08)]"
            aria-hidden
          />
        ) : null}
        <h2
          id={titleId}
          className="truncate font-sans text-xs font-black uppercase tracking-[-0.02em] text-foreground sm:text-sm"
        >
          {title}
        </h2>
      </div>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="shrink-0 rounded-full border border-gold/30 bg-gold/[0.08] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-gold-bright transition-all duration-200 hover:border-gold/45 hover:bg-gold/[0.14] hover:shadow-[0_0_18px_-10px_rgba(201,162,39,0.9)]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
