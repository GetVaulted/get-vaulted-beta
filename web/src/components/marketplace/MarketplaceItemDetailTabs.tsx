"use client";

import { useState } from "react";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";

const tabs = ["Description", "Shipping", "Authentication"] as const;
type TabId = (typeof tabs)[number];

type MarketplaceItemDetailTabsProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
};

export function MarketplaceItemDetailTabs({ listing, extras }: MarketplaceItemDetailTabsProps) {
  const [active, setActive] = useState<TabId>("Description");

  const authBody =
    extras.authenticationLabel ??
    (listing.condition.match(/^(PSA|BGS|SGC)/i)
      ? `${listing.condition} — grading details available from the seller.`
      : `Condition: ${listing.condition}. Request documentation from the seller before purchase if needed.`);

  return (
    <section className="mt-6 border-t border-white/[0.08] pt-6" aria-label="Listing details">
      <div className="flex flex-wrap gap-1 border-b border-white/[0.08] pb-px">
        {tabs.map((id) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`relative rounded-t-lg px-3 py-2.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                selected ? "text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {id}
              {selected ? (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-gold/20 via-gold-bright to-gold/20" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="max-w-prose py-6">
        {active === "Description" ? (
          <p className="text-[15px] leading-relaxed text-zinc-300 sm:text-base">{extras.description}</p>
        ) : null}
        {active === "Shipping" ? (
          <p className="text-[15px] leading-relaxed text-zinc-300 sm:text-base">{extras.shippingSummary}</p>
        ) : null}
        {active === "Authentication" ? (
          <div className="space-y-3 text-[15px] leading-relaxed text-zinc-300 sm:text-base">
            <p>{authBody}</p>
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-zinc-200">Listed condition:</span> {listing.condition}
            </p>
            {listing.allowOffers === true ? (
              <p className="text-sm text-zinc-400">
                <span className="font-semibold text-zinc-200">Offers:</span> The seller is accepting offers on this
                listing.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
