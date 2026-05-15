import Image from "next/image";
import type { PhotoMode } from "@/lib/marketplace-images";
import { getMarketplacePhotoUrl } from "@/lib/marketplace-images";

type CardImagePlaceholderProps = {
  seed: string;
  variant?: "slab" | "product" | "thumb" | "video" | "break";
  className?: string;
  /** Boost clarity for marketplace product grids */
  boostProduct?: boolean;
};

function modeForVariant(variant: CardImagePlaceholderProps["variant"]): PhotoMode {
  if (variant === "slab" || variant === "thumb") return "portrait";
  if (variant === "product") return "product";
  return "landscape";
}

export function CardImagePlaceholder({
  seed,
  variant = "thumb",
  className = "",
  boostProduct = false,
}: CardImagePlaceholderProps) {
  const mode = modeForVariant(variant);
  const src = getMarketplacePhotoUrl(seed, mode);

  const imagePop =
    "absolute inset-0 origin-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.08]";

  const imageClass =
    boostProduct && variant === "slab"
      ? "object-cover brightness-[1.06] contrast-[1.12] saturate-[1.08]"
      : "object-cover brightness-[1.02] contrast-[1.06] saturate-[1.04]";

  return (
    <div className={`relative overflow-hidden bg-zinc-950 ${className}`} aria-hidden>
      <div className={imagePop}>
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width: 768px) 45vw, (max-width: 1200px) 20vw, 240px"
          className={imageClass}
          priority={false}
        />
      </div>

      {/* Top-left key light */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16)_0%,transparent_40%,transparent_100%)]" />
      {/* Bottom weight + vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/78 via-black/12 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_42%,rgba(0,0,0,0.4)_100%)]" />
      {/* Gold wash */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_58%_at_18%_0%,rgba(201,162,39,0.14),transparent_56%)] mix-blend-soft-light" />

      {variant === "slab" ? (
        <div className="pointer-events-none absolute inset-[7%] rounded-md border border-white/14 shadow-[inset_0_0_22px_rgba(0,0,0,0.55)]">
          <div className="absolute inset-[5%] rounded-sm border border-gold/18 bg-gradient-to-b from-white/[0.07] to-transparent" />
        </div>
      ) : null}

      {variant === "product" ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_32%,rgba(0,0,0,0.58)_100%)]" />
      ) : null}

      {variant === "break" ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(201,162,39,0.12)_0%,transparent_32%,transparent_52%,rgba(0,0,0,0.62)_100%)]" />
      ) : null}

      {variant === "video" ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/82 via-black/28 to-black/42" />
      ) : null}

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.038) 0px, rgba(255,255,255,0.038) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, transparent 1px, transparent 5px)",
        }}
      />

      {variant === "thumb" ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,0.52)_100%)]" />
      ) : null}
    </div>
  );
}
