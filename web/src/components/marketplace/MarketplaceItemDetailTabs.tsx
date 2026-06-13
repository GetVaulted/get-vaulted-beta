"use client";

import { useState } from "react";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";

const tabs = ["Description", "Shipping", "Authentication"] as const;
type TabId = (typeof tabs)[number];

type MarketplaceItemDetailTabsProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  variant?: "tabs" | "stacked";
};

export function MarketplaceItemDetailTabs({
  listing,
  extras,
  variant = "tabs",
}: MarketplaceItemDetailTabsProps) {
  const [active, setActive] = useState<TabId>("Description");

  const authBody =
    extras.authenticationLabel ??
    (listing.condition.match(/^(PSA|BGS|SGC)/i)
      ? `${listing.condition} — grading details available from the seller.`
      : `Condition: ${listing.condition}. Request documentation from the seller before purchase if needed.`);

  if (variant === "stacked") {
    return (
      <section className="space-y-8" aria-label="Listing details">
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Description</h2>
          <p className="mt-4 max-w-prose text-base leading-[1.75] text-zinc-200 sm:text-[17px]">{extras.description}</p>
        </div>

        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Shipping</h2>
          <div className="mt-4 space-y-4 rounded-xl border border-white/[0.06] bg-[#0a0a0c]/50 p-5">
            <p className="text-base leading-[1.75] text-zinc-200 sm:text-[17px]">{extras.shippingSummary}</p>
            <dl className="grid gap-3 border-t border-white/[0.06] pt-4 text-sm text-zinc-400 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-zinc-300">Estimated shipping</dt>
                <dd className="mt-0.5">{extras.estimatedShippingDisplay}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-300">Handling</dt>
                <dd className="mt-0.5">{extras.handlingEstimateDisplay}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-zinc-300">Tracking</dt>
                <dd className="mt-0.5">{extras.trackingAfterPurchaseLine}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Authentication</h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-zinc-300 sm:text-base">
            <p>{authBody}</p>
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-zinc-200">Listed condition:</span> {listing.condition}
            </p>
          </div>
        </div>
      </section>
    );
  }

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

      <div className="max-w-prose py-6 sm:max-w-2xl">
        {active === "Description" ? (
          <div className="space-y-4">
            <p className="text-base leading-[1.75] text-zinc-200 sm:text-[17px]">{extras.description}</p>
          </div>
        ) : null}
        {active === "Shipping" ? (
          <div className="space-y-4 rounded-xl border border-white/[0.06] bg-[#0a0a0c]/50 p-5">
            <p className="text-base leading-[1.75] text-zinc-200 sm:text-[17px]">{extras.shippingSummary}</p>
            <dl className="grid gap-3 border-t border-white/[0.06] pt-4 text-sm text-zinc-400 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-zinc-300">Estimated shipping</dt>
                <dd className="mt-0.5">{extras.estimatedShippingDisplay}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-300">Handling</dt>
                <dd className="mt-0.5">{extras.handlingEstimateDisplay}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-zinc-300">Tracking</dt>
                <dd className="mt-0.5">{extras.trackingAfterPurchaseLine}</dd>
              </div>
            </dl>
          </div>
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
