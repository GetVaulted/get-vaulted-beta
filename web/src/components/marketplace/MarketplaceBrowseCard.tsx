import Link from "next/link";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";
import { MarketplaceWatchlistToggle } from "@/components/marketplace/MarketplaceWatchlistToggle";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";
import { sellerProfilePath } from "@/lib/seller-profile-url";

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
    ? "border-gold/35 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.92),0_0_32px_-16px_rgba(201,162,39,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "border-white/[0.1] shadow-[0_16px_48px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)]";

  const hoverMotion =
    asPreview
      ? ""
      : emphasizeHover
        ? "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:scale-[1.015] hover:border-gold/45 hover:shadow-[0_28px_64px_-32px_rgba(0,0,0,0.95),0_0_40px_-12px_rgba(201,162,39,0.32)]"
        : "duration-300 ease-out hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_22px_56px_-30px_rgba(0,0,0,0.92),0_0_28px_-14px_rgba(201,162,39,0.18)]";

  const shellClass = `group relative flex min-w-0 w-full ${compact ? "" : "max-w-[min(100%,380px)]"} flex-col justify-self-stretch overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,#101014_0%,#08080b_100%)] transition-all ${hoverMotion} ${borderClass}`;
  const listingOverlayClass =
    "absolute inset-0 z-20 block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/50";

  const imageAspect = compact ? "aspect-[3/4]" : "aspect-square";
  const bodyPadding = compact ? "p-2" : "p-3 sm:p-3.5";
  const titleClass = compact
    ? "min-h-[1.75rem] text-[10px] leading-tight sm:text-[11px]"
    : "min-h-[2.25rem] text-xs sm:text-sm";
  const priceClass = compact ? "text-xs sm:text-sm" : "text-base sm:text-lg";

  const inner = (
    <>
      <div className={`relative ${imageAspect} w-full overflow-hidden`}>
        <div
          className="absolute inset-0 bg-[linear-gradient(145deg,rgba(201,162,39,0.08)_0%,rgba(255,255,255,0.02)_35%,rgba(0,0,0,0.35)_100%)]"
          aria-hidden
        />
        <div className={`absolute inset-0 ${compact ? "p-1.5" : "p-2.5 sm:p-3"}`}>
          <div className="relative h-full overflow-hidden rounded-lg border border-white/[0.12] bg-[#060608] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),inset_0_12px_32px_rgba(0,0,0,0.45)]">
            {listing.imageUrls && listing.imageUrls.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <CardImagePlaceholder seed={listing.imageSeed} variant="slab" boostProduct className="h-full w-full" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20" />
            {!asPreview && !compact ? (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/75 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="rounded-full border border-gold/35 bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-bright backdrop-blur-sm">
                  View listing →
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {vaultPick ? (
          <span className={`pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-black/70 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-gold-bright backdrop-blur-sm sm:text-[8px] ${compact ? "" : "left-3 top-3 px-2 text-[8px] sm:text-[9px]"}`}>
            <VaultStarIcon className="size-2.5 text-gold-bright" aria-hidden />
            Vault pick
          </span>
        ) : null}

        {listing.isCompanyListing ? (
          <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-sky-400/35 bg-sky-950/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-100 backdrop-blur-sm sm:text-[9px]">
            Official
          </span>
        ) : null}

        <span
          className={`pointer-events-none absolute bottom-2 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full border border-white/15 bg-black/75 px-2 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur-sm sm:text-[8px] ${compact ? "hidden" : "bottom-3 max-w-[calc(100%-1.5rem)] text-[8px] sm:text-[9px]"}`}
        >
          {listing.condition}
        </span>

        {!asPreview ? (
          <div className={`pointer-events-auto absolute z-30 rounded-full bg-black/60 backdrop-blur-sm ${compact ? "bottom-2 right-2" : "bottom-3 right-3"}`}>
            <MarketplaceWatchlistToggle listingId={listing.id} sellerId={listing.sellerId} variant="panel" />
          </div>
        ) : null}
      </div>

      <div className={`pointer-events-none flex flex-1 flex-col border-t border-white/[0.07] ${compact ? "gap-1" : "gap-1.5"} ${bodyPadding}`}>
        {!compact ? (
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">{listing.category}</p>
        ) : null}
        <h3
          className={`line-clamp-2 font-display font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-gold-bright ${titleClass}`}
        >
          {listing.title}
        </h3>
        <p className={`font-mono font-black leading-none tracking-tight text-gold-bright ${priceClass}`}>
          {formatMarketplaceUsd(listing.price)}
        </p>
        <div
          className={`pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-500 ${compact ? "text-[9px]" : "text-[10px] sm:text-[11px]"}`}
        >
          <Link
            href={sellerProfilePath(listing.sellerUsername)}
            className="inline-flex items-center gap-1 font-medium text-zinc-400 transition hover:text-gold-bright/90"
          >
            @{listing.sellerUsername}
            {listing.sellerVerified ? <VerifiedIcon className="size-3 text-sky-300/90" aria-label="Verified seller" /> : null}
          </Link>
          {listing.sellerLevelLabel ? (
            <span className="text-[8px] font-bold uppercase tracking-wide text-gold-bright/75 sm:text-[9px]">
              · {listing.sellerLevelLabel}
            </span>
          ) : null}
        </div>
        {(listing.allowOffers || listing.acceptTradeOffers) && !compact ? (
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
            {listing.allowOffers && listing.acceptTradeOffers
              ? "Offers & trades welcome"
              : listing.allowOffers
                ? "Offers welcome"
                : "Trades welcome"}
          </p>
        ) : null}
        {asPreview ? (
          <div className="mt-auto border-t border-white/5 pt-2">
            <span className="flex w-full items-center justify-center rounded-lg border border-gold/25 bg-gold/[0.08] py-1.5 text-[10px] font-black uppercase tracking-wide text-gold-bright">
              Live preview
            </span>
          </div>
        ) : null}
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

function VaultStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1.2l1.55 3.14 3.47.5-2.51 2.45.59 3.45L8 9.35l-3.1 1.63.59-3.45L3 4.84l3.47-.5L8 1.2z" />
    </svg>
  );
}

function VerifiedIcon({ className, "aria-label": ariaLabel }: { className?: string; "aria-label"?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-label={ariaLabel}>
      <path
        d="M8 1.5l1.2 2.45 2.7.4-1.95 1.9.46 2.7L8 7.65 5.59 9.05l.46-2.7L4.1 4.35l2.7-.4L8 1.5z"
        fill="currentColor"
        fillOpacity={0.25}
      />
      <path
        d="M6.2 8.1l1.1 1.1 2.5-2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
