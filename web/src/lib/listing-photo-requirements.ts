import type { BuyingFormat, ListingStatus } from "@/generated/prisma/client";
import { isLiveShowInventoryDraft } from "@/lib/marketplace-commerce-policy";

export const MARKETPLACE_MIN_PHOTOS = 3;
export const MARKETPLACE_MAX_PHOTOS = 10;
export const LIVE_INVENTORY_PHOTOS = 1;

export function validateListingImageCount(args: {
  buyingFormat: BuyingFormat;
  status: ListingStatus;
  imageCount: number;
}): { ok: true } | { ok: false; error: string } {
  if (isLiveShowInventoryDraft(args)) {
    if (args.imageCount !== LIVE_INVENTORY_PHOTOS) {
      return {
        ok: false,
        error: "Live show inventory requires exactly 1 thumbnail image.",
      };
    }
    return { ok: true };
  }

  if (args.buyingFormat === "buy_now" && args.status === "active") {
    if (args.imageCount < MARKETPLACE_MIN_PHOTOS) {
      return {
        ok: false,
        error: `Add at least ${MARKETPLACE_MIN_PHOTOS} photos.`,
      };
    }
    if (args.imageCount > MARKETPLACE_MAX_PHOTOS) {
      return {
        ok: false,
        error: `Listings support up to ${MARKETPLACE_MAX_PHOTOS} photos.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Live-room queue item thumbnail: optional. Hosts frequently add spot/break/auction lots on the
 * fly mid-show, and a hard photo requirement blocked that — unlike marketplace listings (see
 * `validateListingImageCount` above), a live queue item has no photo minimum. Kept as a function
 * (rather than removing the call site) so a future requirement is a one-line change.
 */
export function validateLiveRoomItemThumbnail(
  _imageUrl: string,
): { ok: true } | { ok: false; error: string } {
  return { ok: true };
}
