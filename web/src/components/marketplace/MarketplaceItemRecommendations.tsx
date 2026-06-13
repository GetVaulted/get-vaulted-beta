import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import type { MarketplaceListing } from "@/content/marketplace-listings";

function RecommendationRail({
  id,
  title,
  listings,
  vertical = false,
}: {
  id: string;
  title: string;
  listings: MarketplaceListing[];
  vertical?: boolean;
}) {
  if (listings.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </h2>
      <div
        className={
          vertical
            ? "space-y-3"
            : "flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
        }
      >
        {listings.map((l) => (
          <div key={l.id} className={vertical ? "w-full" : "w-[168px] shrink-0 sm:w-[180px]"}>
            <MarketplaceBrowseCard listing={l} emphasizeHover vaultPick={Boolean(l.vaultPick)} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

export function MarketplaceItemRecommendations({
  similar,
  sameSeller,
  related,
  layout = "full",
}: {
  similar: MarketplaceListing[];
  sameSeller: MarketplaceListing[];
  related: MarketplaceListing[];
  layout?: "full" | "sidebar";
}) {
  if (similar.length === 0 && sameSeller.length === 0 && related.length === 0) return null;

  if (layout === "sidebar") {
    return (
      <aside className="space-y-8 lg:sticky lg:top-24">
        <RecommendationRail id="item-similar" title="Similar items" listings={similar} vertical />
        <RecommendationRail id="item-seller-more" title="More from this seller" listings={sameSeller} vertical />
        <RecommendationRail id="item-related" title="Related collectibles" listings={related} vertical />
      </aside>
    );
  }

  return (
    <div className="mt-10 space-y-8 border-t border-white/[0.07] pt-8">
      <RecommendationRail id="item-similar" title="Similar items" listings={similar} />
      <RecommendationRail id="item-seller-more" title="More from this seller" listings={sameSeller} />
      <RecommendationRail id="item-related" title="Related collectibles" listings={related} />
    </div>
  );
}
