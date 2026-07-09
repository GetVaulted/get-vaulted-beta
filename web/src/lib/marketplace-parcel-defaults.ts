import type { ShippingCategory } from "@/generated/prisma/enums";
import type { ShippoParcel } from "@/lib/shippo";
import { hasCompleteParcel, type ParcelFields } from "@/lib/listing-publish";

/** Realistic parcel envelope for a single graded slab in a bubble mailer. */
export const GRADED_SLAB_PARCEL = {
  parcelWeightOz: 5,
  parcelLengthIn: 7,
  parcelWidthIn: 5,
  parcelHeightIn: 1,
} as const;

/** Raw card in penny sleeve + team bag / small mailer. */
export const RAW_CARD_PARCEL = {
  parcelWeightOz: 4,
  parcelLengthIn: 6,
  parcelWidthIn: 4,
  parcelHeightIn: 1,
} as const;

/** Small collectible (Funko, etc.) in retail box + mailer. */
export const SMALL_COLLECTIBLE_PARCEL = {
  parcelWeightOz: 6,
  parcelLengthIn: 8,
  parcelWidthIn: 6,
  parcelHeightIn: 3,
} as const;

type CategoryParcelPreset = {
  readonly parcelWeightOz: number;
  readonly parcelLengthIn: number;
  readonly parcelWidthIn: number;
  readonly parcelHeightIn: number;
};

const CATEGORY_PARCEL: Partial<Record<ShippingCategory, CategoryParcelPreset>> = {
  slab: GRADED_SLAB_PARCEL,
  raw_card: RAW_CARD_PARCEL,
  small_collectible: SMALL_COLLECTIBLE_PARCEL,
};

function toShippoParcel(row: ParcelFields): ShippoParcel {
  return {
    length: String(row.parcelLengthIn),
    width: String(row.parcelWidthIn),
    height: String(row.parcelHeightIn),
    distance_unit: "in",
    weight: String(Math.max(1, row.parcelWeightOz!)),
    mass_unit: "oz",
  };
}

type ListingParcelSource = ParcelFields & {
  shippingCategory?: ShippingCategory | string | null;
  platformShippingProfile?: {
    defaultWeightOz: number;
    defaultLengthIn: number;
    defaultWidthIn: number;
    defaultHeightIn: number;
  } | null;
};

/** Older listings used oversized slab presets (8–16 oz, 8×6×2+), which inflated Shippo quotes. */
export function isInflatedCardParcel(row: ParcelFields): boolean {
  const w = row.parcelWeightOz;
  const l = row.parcelLengthIn;
  const wi = row.parcelWidthIn;
  const h = row.parcelHeightIn;
  if (!hasCompleteParcel(row)) return false;
  if (w != null && w > 6) return true;
  if (l != null && l > 7) return true;
  if (wi != null && wi > 5) return true;
  if (h != null && h > 1.5) return true;
  return false;
}

/** Legacy small-collectible presets used medium-box dimensions (10×8×6, 16 oz). */
export function isInflatedSmallCollectibleParcel(row: ParcelFields): boolean {
  const w = row.parcelWeightOz;
  const l = row.parcelLengthIn;
  const wi = row.parcelWidthIn;
  const h = row.parcelHeightIn;
  if (!hasCompleteParcel(row)) return false;
  if (w != null && w > 8) return true;
  if (l != null && l > 9) return true;
  if (wi != null && wi > 7) return true;
  if (h != null && h > 5) return true;
  return false;
}

function shouldUseCategoryPreset(
  category: ShippingCategory | undefined,
  listing: ParcelFields,
  preset: CategoryParcelPreset | undefined,
): preset is CategoryParcelPreset {
  if (!preset || !category) return false;
  if (!hasCompleteParcel(listing)) return true;
  if (category === "slab" || category === "raw_card") return isInflatedCardParcel(listing);
  if (category === "small_collectible") return isInflatedSmallCollectibleParcel(listing);
  return false;
}

/**
 * Parcel used for marketplace Shippo quotes — card categories use tight envelopes so
 * buyers aren't quoted medium-box rates for a single slab.
 */
export function resolveMarketplaceQuoteParcel(listing: ListingParcelSource): ShippoParcel {
  const category = listing.shippingCategory as ShippingCategory | undefined;
  const preset = category ? CATEGORY_PARCEL[category] : undefined;

  if (shouldUseCategoryPreset(category, listing, preset)) {
    return toShippoParcel(preset);
  }

  if (hasCompleteParcel(listing)) {
    return toShippoParcel(listing);
  }

  if (listing.platformShippingProfile) {
    const p = listing.platformShippingProfile;
    return toShippoParcel({
      parcelWeightOz: p.defaultWeightOz,
      parcelLengthIn: p.defaultLengthIn,
      parcelWidthIn: p.defaultWidthIn,
      parcelHeightIn: p.defaultHeightIn,
    });
  }

  if (preset) return toShippoParcel(preset);

  return toShippoParcel(GRADED_SLAB_PARCEL);
}
