type MarketplaceSectionHeaderProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: string;
  accent?: "gold" | "neutral";
};

export function MarketplaceSectionHeader({
  id,
  eyebrow,
  title,
  description,
  meta,
  accent = "neutral",
}: MarketplaceSectionHeaderProps) {
  const borderClass = accent === "gold" ? "border-gold/25" : "border-white/[0.08]";
  const titleClass = accent === "gold" ? "text-gold-bright" : "text-foreground";

  return (
    <div className={`mb-4 border-b pb-3 ${borderClass}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/80">{eyebrow}</p>
          ) : null}
          <h2 id={id} className={`font-display text-xl font-black tracking-tight sm:text-2xl ${titleClass}`}>
            {title}
          </h2>
          {description ? <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">{description}</p> : null}
        </div>
        {meta ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Premium browse grid — larger tiles than homepage featured row */
export const marketplaceBrowseGridClass =
  "grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 lg:gap-4";
