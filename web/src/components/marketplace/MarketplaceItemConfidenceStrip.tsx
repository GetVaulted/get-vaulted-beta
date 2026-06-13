import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import type { MarketplaceListing } from "@/content/marketplace-listings";

const BASE_ITEMS = [
  "Protected checkout",
  "Verified seller",
  "Secure shipping",
  "Authentication",
  "Buyer protection",
] as const;

type MarketplaceItemConfidenceStripProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
};

export function MarketplaceItemConfidenceStrip({ listing, extras }: MarketplaceItemConfidenceStripProps) {
  const showAuth =
    Boolean(extras.authenticationLabel) ||
    Boolean(listing.condition.match(/^(PSA|BGS|SGC)/i)) ||
    Boolean(listing.vaultPick);

  const items = showAuth ? [...BASE_ITEMS] : BASE_ITEMS.filter((x) => x !== "Authentication");

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-[#101014] px-4 py-3"
      role="list"
      aria-label="Purchase confidence"
    >
      {items.map((label) => (
        <span
          key={label}
          role="listitem"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300"
        >
          <svg className="size-3.5 shrink-0 text-gold-bright" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 8.5l3 3 7-7.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
