type MarketplaceSectionHeaderProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: string;
  accent?: "gold" | "neutral";
  compact?: boolean;
};

export function MarketplaceSectionHeader({
  id,
  eyebrow,
  title,
  description,
  meta,
  accent = "neutral",
  compact = false,
}: MarketplaceSectionHeaderProps) {
  const borderClass = accent === "gold" ? "border-gold/25" : "border-white/[0.08]";
  const titleClass = accent === "gold" ? "text-gold-bright" : "text-foreground";

  if (compact) {
    return (
      <div className={`mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2 ${borderClass}`}>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gold-bright/75">{eyebrow}</p>
          ) : null}
          <h2 id={id} className={`font-display text-base font-black tracking-tight sm:text-lg ${titleClass}`}>
            {title}
          </h2>
        </div>
        {meta ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{meta}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`mb-3 border-b pb-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/80">{eyebrow}</p>
          ) : null}
          <h2 id={id} className={`font-display text-lg font-black tracking-tight sm:text-xl ${titleClass}`}>
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-zinc-500 sm:text-sm">{description}</p> : null}
        </div>
        {meta ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Inventory grid — 2 columns on phones, scales up on larger breakpoints.
 * Avoids auto-fill minmax(320px) which forces a single full-width column on mobile.
 */
export const marketplaceBrowseGridClass =
  "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5 2xl:grid-cols-6";
