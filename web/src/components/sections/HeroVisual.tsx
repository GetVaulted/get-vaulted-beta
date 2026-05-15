/**
 * Homepage hero showcase. Renders the pre-composed brand artwork at
 * `public/brand/homepage-image.png` (already includes the slab frame,
 * cards, memorabilia, badges, and "Listing preview" chrome).
 *
 * The wrapper preserves the same min-height and full-height behavior the
 * surrounding `Hero` grid expects, so swapping the inner composition does
 * not affect the layout.
 */
export function HeroVisual() {
  return (
    <div className="relative h-full min-h-[220px] w-full lg:min-h-0">
      <div className="relative flex h-full min-h-[220px] items-center justify-center lg:min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered hero artwork; native scaling, no Next/Image optimizer needed */}
        <img
          src="/brand/homepage-image.png"
          alt=""
          width={1371}
          height={1147}
          className="h-full max-h-[min(60vh,460px)] w-auto max-w-full object-contain"
          draggable={false}
          aria-hidden
        />
      </div>
    </div>
  );
}
