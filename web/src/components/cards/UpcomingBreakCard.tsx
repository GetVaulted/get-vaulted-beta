import Link from "next/link";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";

type UpcomingBreakCardProps = {
  day: string;
  weekday: string;
  time: string;
  title: string;
  spots: string;
  price: number;
  /** When set, shown instead of a formatted dollar amount (e.g. scheduled rooms without a single spot price). */
  priceLabel?: string;
  seed: string;
  href?: string;
};

export function UpcomingBreakCard({
  day,
  weekday,
  time,
  title,
  spots,
  price,
  priceLabel,
  seed,
  href = "#upcoming",
}: UpcomingBreakCardProps) {
  return (
    <article className="group flex w-[min(100%,300px)] shrink-0 gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] p-2.5 shadow-[0_14px_44px_-26px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-out hover:scale-105 hover:border-gold/40 hover:shadow-[0_24px_56px_-22px_rgba(201,162,39,0.24)] sm:w-[290px]">
      <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#08080a] py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <span className="text-[9px] font-black uppercase tracking-wide text-gold-bright">{weekday}</span>
        <span className="font-display text-lg font-extrabold leading-none tracking-tight text-foreground">
          {day.split(/\s+/)[1] ?? "—"}
        </span>
        <span className="mt-0.5 text-[8px] text-zinc-500">{day.split(/\s+/)[0] ?? ""}</span>
      </div>
      <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl border border-white/10">
        <CardImagePlaceholder seed={seed} variant="product" className="h-full w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
        <div>
          <p className="text-[10px] font-bold text-gold-bright/90">{time}</p>
          <h3 className="line-clamp-2 text-[11px] font-extrabold leading-tight tracking-tight text-foreground">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[10px] tabular-nums text-zinc-500">{spots}</span>
          <span className="text-[10px] text-white/12">·</span>
          <span className="font-mono text-[11px] font-black text-gold-bright">
            {priceLabel ?? `$${price}`}
          </span>
          <Link
            href={href}
            className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-gold-bright transition-all duration-200 hover:border-gold/55 hover:bg-gold/20 hover:brightness-110"
          >
            View break
          </Link>
        </div>
      </div>
    </article>
  );
}
