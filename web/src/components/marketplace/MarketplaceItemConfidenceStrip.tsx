import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import type { MarketplaceListing } from "@/content/marketplace-listings";

const BASE_ITEMS = [
  "Protected checkout",
  "Verified seller",
  "Secure shipping",
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

  const items = showAuth ? [...BASE_ITEMS.slice(0, 3), "Authentication available", BASE_ITEMS[3]] : [...BASE_ITEMS];

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.08] bg-[#0a0a0c]/90 px-4 py-3"
      role="list"
      aria-label="Purchase confidence"
    >
      {items.map((label) => (
        <span key={label} role="listitem" className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <svg className="size-3.5 shrink-0 text-emerald-400/90" viewBox="0 0 16 16" fill="none" aria-hidden>
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
