"use client";

import { useCallback, useEffect, useState } from "react";
import { CardImagePlaceholder } from "@/components/ui/CardImagePlaceholder";

type MarketplaceItemGalleryProps = {
  seeds: string[];
  imageUrls?: string[];
  title?: string;
};

export function MarketplaceItemGallery({ seeds, imageUrls, title }: MarketplaceItemGalleryProps) {
  const urls = imageUrls && imageUrls.length > 0 ? imageUrls : null;
  const unique = urls ?? (seeds.length > 0 ? seeds : []);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const safeIndex = Math.min(active, Math.max(0, unique.length - 1));
  const activeItem = unique[safeIndex] ?? unique[0];

  const goPrev = useCallback(() => {
    setActive((i) => (i <= 0 ? unique.length - 1 : i - 1));
  }, [unique.length]);

  const goNext = useCallback(() => {
    setActive((i) => (i >= unique.length - 1 ? 0 : i + 1));
  }, [unique.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, lightboxOpen]);

  if (!activeItem) return null;

  const usePhotos = Boolean(urls);
  const alt = title?.trim() || "Listing photo";

  const renderImage = (item: string, className: string) =>
    usePhotos ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item} alt={alt} className={className} />
    ) : (
      <CardImagePlaceholder seed={item} variant="slab" boostProduct className={className} />
    );

  return (
    <>
      <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:flex lg:max-w-none lg:gap-3">
        {unique.length > 1 ? (
          <div className="mb-2 hidden shrink-0 flex-col gap-2 lg:flex">
            {unique.map((item, i) => {
              const selected = i === safeIndex;
              return (
                <button
                  key={`${item}-v-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`relative h-[72px] w-[72px] overflow-hidden rounded-xl border bg-[#0b0b0e] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/45 ${
                    selected
                      ? "border-gold/55 ring-1 ring-gold/35"
                      : "border-white/[0.1] opacity-75 hover:border-white/20 hover:opacity-100"
                  }`}
                  aria-label={`Show image ${i + 1}`}
                  aria-pressed={selected}
                >
                  {renderImage(item, "h-full w-full object-cover")}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="group relative overflow-hidden rounded-2xl border border-gold/20 bg-[#0b0b0e] shadow-[0_0_40px_-20px_rgba(201,162,39,0.35)]">
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="relative block h-full w-full cursor-zoom-in transition duration-300 hover:opacity-[0.98]"
                aria-label="Open full-screen gallery"
              >
                <div key={activeItem} className="h-full w-full transition-opacity duration-200">
                  {renderImage(activeItem, "h-full w-full object-cover")}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-zinc-100 backdrop-blur-sm transition hover:border-white/25"
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm6 0h4v4H9V9z" stroke="currentColor" strokeWidth="1.25" />
                </svg>
                Expand
              </button>
              {unique.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/45 p-2 text-zinc-100 backdrop-blur-sm transition hover:bg-black/60 lg:inline-flex"
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/45 p-2 text-zinc-100 backdrop-blur-sm transition hover:bg-black/60 lg:inline-flex"
                    aria-label="Next image"
                  >
                    ›
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {unique.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5 pt-0.5 lg:hidden [-ms-overflow-style:none] [scrollbar-width:thin]">
              {unique.map((item, i) => {
                const selected = i === safeIndex;
                return (
                  <button
                    key={`${item}-${i}`}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-[#0b0b0e] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/45 sm:h-[72px] sm:w-[72px] ${
                      selected
                        ? "border-gold/55 ring-1 ring-gold/35"
                        : "border-white/[0.1] opacity-80 hover:border-white/20 hover:opacity-100"
                    }`}
                    aria-label={`Show image ${i + 1}`}
                    aria-pressed={selected}
                  >
                    {renderImage(item, "h-full w-full object-cover")}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen gallery"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-sm font-semibold text-zinc-100"
            onClick={() => setLightboxOpen(false)}
          >
            Close
          </button>
          {unique.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-2xl text-zinc-100"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-2xl text-zinc-100"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label="Next image"
              >
                ›
              </button>
            </>
          ) : null}
          <div className="max-h-[90vh] max-w-[min(960px,92vw)]" onClick={(e) => e.stopPropagation()}>
            {renderImage(activeItem, "max-h-[90vh] w-auto max-w-full object-contain")}
          </div>
        </div>
      ) : null}
    </>
  );
}
