import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import type { MarketplaceListing } from "@/content/marketplace-listings";

const BASE_ITEMS = ["Protected checkout", "Secure shipping", "Buyer protection"] as const;

type MarketplaceItemConfidenceStripProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
};

export function MarketplaceItemConfidenceStrip({ listing, extras }: MarketplaceItemConfidenceStripProps) {
  // "Verified seller" and "Authentication" are claims of platform verification, so they must be
  // backed by a real signal (graded slab, authentication doc on file, or the seller's real
  // backend-computed trust tier) — never shown unconditionally, and never driven by the
  // seller-settable `vaultPick` editorial/featured flag (legal/compliance audit 2026-07).
  const isVerifiedSellerLevel = listing.sellerLevel === "vault_verified" || listing.sellerLevel === "elite_vault_verified";
  const showAuth = Boolean(extras.authenticationLabel) || Boolean(listing.condition.match(/^(PSA|BGS|SGC)/i));

  const items = [
    ...BASE_ITEMS,
    ...(isVerifiedSellerLevel ? (["Verified seller"] as const) : []),
    ...(showAuth ? (["Authentication"] as const) : []),
  ];

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
