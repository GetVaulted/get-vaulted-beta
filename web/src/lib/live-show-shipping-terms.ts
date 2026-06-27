import type { LiveShowCarrierPreference, LiveShowShippingMode } from "@/generated/prisma/enums";
import {
  DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  liveShowShippingConfigFromTerms,
  resolveLiveShowShippingCapCents,
  roomFlagsFromShippingMode,
  shippingModeFromRoomFlags,
  type LiveShowShippingTerms,
} from "../../../shared/live-show-shipping-config";

export type { LiveShowShippingMode, LiveShowCarrierPreference, LiveShowShippingTerms } from "../../../shared/live-show-shipping-config";
export {
  DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  resolveLiveShowShippingCapCents,
  roomFlagsFromShippingMode,
  shippingModeFromRoomFlags,
  defaultLiveShowShippingTerms,
  buyerLiveShippingPreviewCopy,
  buyerLiveShippingPaidCopy,
  buyerLiveShowShippingHudCopy,
  sellerCappedShippingSummary,
  formatUsdFromCents,
  liveShowShippingConfigFromTerms,
} from "../../../shared/live-show-shipping-config";

export function liveShowShippingTermsFromRoom(room: {
  shippingMode?: LiveShowShippingMode | null;
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
  carrierPreference?: LiveShowCarrierPreference | null;
  bundleEligiblePurchases?: boolean | null;
  shippingTermsVersion?: number | null;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
}): LiveShowShippingTerms {
  return {
    shippingMode: shippingModeFromRoomFlags(room),
    shippingCapCents:
      shippingModeFromRoomFlags(room) === "capped"
        ? resolveLiveShowShippingCapCents(room.shippingCapCents)
        : null,
    carrierPreference: room.carrierPreference ?? "best_rate",
    bundleEligiblePurchases: room.bundleEligiblePurchases !== false,
    sellerPaysOverCap: room.sellerPaysOverCap !== false,
    shippingTermsVersion: room.shippingTermsVersion ?? 1,
    defaultShippingProfileId: room.defaultShippingProfileId ?? null,
    defaultSellerShippingProfileId: room.defaultSellerShippingProfileId ?? null,
  };
}

export function buildLiveShowShippingConfig(room: Parameters<typeof liveShowShippingTermsFromRoom>[0]) {
  return liveShowShippingConfigFromTerms(liveShowShippingTermsFromRoom(room));
}

export function shippingTermsSnapshotJson(terms: LiveShowShippingTerms): Record<string, unknown> {
  return { ...terms };
}

/** Apply mode to legacy boolean columns when persisting LiveRoom. */
export function liveRoomShippingPatchFromMode(args: {
  shippingMode: LiveShowShippingMode;
  shippingCapCents?: number | null;
}): {
  shippingMode: LiveShowShippingMode;
  shippingCapEnabled: boolean;
  freeShippingEnabled: boolean;
  shippingCapCents: number | null;
} {
  const flags = roomFlagsFromShippingMode(args.shippingMode);
  return {
    shippingMode: args.shippingMode,
    ...flags,
    shippingCapCents:
      args.shippingMode === "capped"
        ? resolveLiveShowShippingCapCents(args.shippingCapCents)
        : null,
  };
}

export const LIVE_SHIPPING_SETTINGS_FUTURE_ONLY_WARNING =
  "These changes apply to future purchases only. Shipping already paid by buyers will not change.";

export const LIVE_SHIPPING_SETTINGS_TERMS_CHANGE_WARNING =
  "Buyers will see the new shipping terms before their next purchase. Existing purchases are unchanged.";
