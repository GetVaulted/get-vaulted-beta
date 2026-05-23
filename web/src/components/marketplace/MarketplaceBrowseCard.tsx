import Link from "next/link";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";
import type { MarketplaceCategory, MarketplaceListing } from "@/content/marketplace-listings";
import { sellerProfilePath } from "@/lib/seller-profile-url";

function formatPrice(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const categoryTone: Record<MarketplaceCategory, string> = {
  "Trading Cards": "border-sky-300/25 bg-sky-950/25 text-sky-100/90",
  Memorabilia: "border-amber-300/20 bg-amber-950/20 text-amber-100/85",
  Watches: "border-zinc-400/25 bg-zinc-900/40 text-zinc-200/90",
  Sneakers: "border-fuchsia-300/20 bg-fuchsia-950/18 text-fuchsia-100/85",
  Other: "border-emerald-300/20 bg-emerald-950/18 text-emerald-100/85",
};

const buyNowBadgeTone =
  "border-emerald-400/28 bg-emerald-950/40 text-emerald-100/95 shadow-[0_4px_14px_rgba(0,0,0,0.45)]";
const offersBadgeTone =
  "border-sky-400/28 bg-sky-950/40 text-sky-100/95 shadow-[0_4px_14px_rgba(0,0,0,0.45)]";
const tradesBadgeTone =
  "border-amber-400/28 bg-amber-950/40 text-amber-100/95 shadow-[0_4px_14px_rgba(0,0,0,0.45)]";

type MarketplaceBrowseCardProps = {
  listing: MarketplaceListing;
  vaultPick?: boolean;
  emphasizeHover?: boolean;
  asPreview?: boolean;
  compact?: boolean;
};

export function MarketplaceBrowseCard({
  listing,
  vaultPick = false,
  emphasizeHover = false,
  asPreview = false,
  compact = false,
}: MarketplaceBrowseCardProps) {
  const borderClass = vaultPick
    ? "border-gold/30 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.88),0_0_22px_-14px_rgba(201,162,39,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "border-white/10 shadow-[0_14px_44px_-26px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)]";

  const hoverMotion =
    asPreview
      ? ""
      : emphasizeHover
        ? "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:scale-[1.02] hover:border-gold/40 hover:shadow-[0_22px_56px_-28px_rgba(0,0,0,0.92),0_0_36px_-14px_rgba(201,162,39,0.22)]"
        : "duration-300 ease-out hover:-translate-y-0.5 hover:border-gold/35";

  const shellClass = `group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-[#0b0b0e] transition-all ${hoverMotion} ${borderClass}`;
  const listingOverlayClass =
    "absolute inset-0 z-0 block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/50";

  const inner = (
    <>
      <div className="pointer-events-none relative aspect-square w-full overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          {listing.imageUrls && listing.imageUrls.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <CardImagePlaceholder seed={listing.imageSeed} variant="slab" boostProduct className="h-full w-full" />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/5 via-transparent to-black/25 opacity-95" />

        <div className="absolute left-1.5 top-1.5 z-[2] flex max-w-[min(100%-4.5rem,100%)] flex-wrap gap-1">
          {listing.isCompanyListing ? (
            <span className="inline-flex rounded-md border border-sky-400/35 bg-sky-950/60 px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide text-sky-100/95 shadow-[0_4px_14px_rgba(0,0,0,0.45)] sm:text-[9px]">
              Official
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide shadow-[0_4px_14px_rgba(0,0,0,0.45)] sm:text-[9px] ${categoryTone[listing.category]}`}
          >
            {listing.category}
          </span>
        </div>
        <div className="absolute right-1.5 top-1.5 z-[2] flex max-w-[min(62%,calc(100%-4.75rem))] flex-col items-end gap-1">
          <span
            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide backdrop-blur-sm sm:px-2 sm:text-[9px] ${buyNowBadgeTone}`}
          >
            Buy now
          </span>
          {listing.allowOffers ? (
            <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide backdrop-blur-sm sm:text-[9px] ${offersBadgeTone}`}>
              Offers on
            </span>
          ) : null}
          {listing.acceptTradeOffers ? (
            <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide backdrop-blur-sm sm:text-[9px] ${tradesBadgeTone}`}>
              Trades on
            </span>
          ) : null}
        </div>
        <span className="absolute bottom-1.5 left-1.5 z-[2] max-w-[calc(100%-0.75rem)] truncate rounded-md border border-white/15 bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold leading-tight text-zinc-200 backdrop-blur-sm sm:text-[9px]">
          {listing.condition}
        </span>
      </div>

      <div
        className={`pointer-events-none flex flex-1 flex-col border-t border-white/[0.08] bg-white/[0.025] backdrop-blur-md ${compact ? "gap-1.5 p-2.5" : "gap-2.5 p-3"}`}
      >
        <h3
          className={`line-clamp-2 font-bold leading-snug tracking-tight text-foreground group-hover:text-gold-bright ${compact ? "min-h-[2rem] text-[10px] sm:text-[11px]" : "min-h-[2.25rem] text-[11px] sm:text-xs"}`}
        >
          {listing.title}
        </h3>
        <p
          className={`font-mono font-black leading-none tracking-tight text-gold-bright ${compact ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}
        >
          {formatPrice(listing.price)}
        </p>
        <div
          className={`pointer-events-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-tight text-zinc-500 ${compact ? "text-[9px]" : "text-[10px]"}`}
        >
          <Link
            href={sellerProfilePath(listing.sellerUsername)}
            className="font-medium text-zinc-400 transition hover:text-gold-bright/90"
          >
            @{listing.sellerUsername}
          </Link>
          {listing.sellerRating != null ? (
            <span className="tabular-nums text-zinc-500">★ {listing.sellerRating.toFixed(1)}</span>
          ) : null}
          {listing.sellerVerified ? (
            <span className="inline-flex items-center gap-0.5 rounded border border-sky-400/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-sky-200 sm:text-[9px]">
              Verified
            </span>
          ) : null}
        </div>
        <div className={`mt-auto border-t border-white/5 ${compact ? "pt-2" : "pt-3"}`}>
          <span
            className={`flex w-full items-center justify-center rounded-lg border border-gold/25 bg-gold/[0.08] font-black uppercase tracking-wide text-gold-bright transition group-hover:border-gold/40 group-hover:bg-gold/[0.12] ${compact ? "py-1 text-[9px]" : "py-1.5 text-[10px]"}`}
          >
            {asPreview ? "Live preview" : "View listing"}
          </span>
        </div>
      </div>
    </>
  );

  if (asPreview) {
    return (
      <div className={`${shellClass} cursor-default`} role="region" aria-label="Listing preview">
        {inner}
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <Link href={listing.href} className={listingOverlayClass} aria-label={`View listing: ${listing.title}`} />
      {inner}
    </div>
  );
}
