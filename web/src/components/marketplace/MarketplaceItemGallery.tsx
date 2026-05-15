"use client";

import { useState } from "react";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";

type MarketplaceItemGalleryProps = {
  seeds: string[];
  imageUrls?: string[];
};

export function MarketplaceItemGallery({ seeds, imageUrls }: MarketplaceItemGalleryProps) {
  const urls = imageUrls && imageUrls.length > 0 ? imageUrls : null;
  const unique = urls ?? (seeds.length > 0 ? seeds : []);
  const [active, setActive] = useState(0);

  const safeIndex = Math.min(active, Math.max(0, unique.length - 1));
  const activeItem = unique[safeIndex] ?? unique[0];

  if (!activeItem) return null;

  const usePhotos = Boolean(urls);

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-2.5 lg:mx-0">
      <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0b0e] shadow-[0_20px_50px_-28px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <div className="h-full w-full">
            <div key={activeItem} className="relative h-full w-full">
              {usePhotos ? (
                // eslint-disable-next-line @next/next/no-img-element -- seller uploads are data URLs / blob URLs
                <img src={activeItem} alt="" className="h-full w-full object-cover" />
              ) : (
                <CardImagePlaceholder seed={activeItem} variant="slab" boostProduct className="h-full w-full" />
              )}
            </div>
          </div>
        </div>
      </div>
      {unique.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
          {unique.map((item, i) => {
            const selected = i === safeIndex;
            return (
              <button
                key={`${item}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-[#0b0b0e] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/45 sm:h-16 sm:w-16 ${
                  selected
                    ? "border-gold/55 ring-1 ring-gold/35"
                    : "border-white/[0.1] opacity-80 hover:border-white/20 hover:opacity-100"
                }`}
                aria-label={`Show image ${i + 1}`}
                aria-pressed={selected}
              >
                {usePhotos ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item} alt="" className="h-full w-full object-cover" />
                ) : (
                  <CardImagePlaceholder seed={item} variant="slab" boostProduct className="h-full w-full" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
