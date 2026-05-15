import type { ListingStatus } from "@/generated/prisma/client";

export function listingStatusIsPublished(status: ListingStatus): boolean {
  return status === "active" || status === "auction_live";
}

export type ParcelFields = {
  parcelWeightOz: number | null;
  parcelLengthIn: number | null;
  parcelWidthIn: number | null;
  parcelHeightIn: number | null;
};

/** Shippo label purchase requires positive imperial parcel dimensions and weight. */
export function hasCompleteParcel(row: ParcelFields): boolean {
  return [row.parcelWeightOz, row.parcelLengthIn, row.parcelWidthIn, row.parcelHeightIn].every(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
}
