/** Single source of truth for live-show buyer shipping defaults and UX copy. */

export type LiveShowShippingMode = "calculated" | "capped" | "free";

export type LiveShowCarrierPreference = "usps" | "ups" | "best_rate";

/** Default buyer shipping cap for capped live shows (admin-configurable via env on server). */
export const DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS = 999;

/**
 * Hard platform ceiling: a live-show buyer never pays more than this for shipping
 * (per bundled session), even if the host picks "calculated" rates or sets a higher cap.
 */
export const PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS = DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS;

export function resolveLiveShowShippingCapCents(overrideCents?: number | null): number {
  let resolved = DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS;
  if (overrideCents != null && Number.isFinite(overrideCents) && overrideCents >= 0) {
    resolved = Math.floor(overrideCents);
  } else {
    const fromEnv =
      typeof process !== "undefined" ? Number(process.env.LIVE_SHIPPING_CAP_CENTS) : Number.NaN;
    if (Number.isFinite(fromEnv) && fromEnv >= 0) resolved = Math.floor(fromEnv);
  }
  return Math.min(resolved, PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS);
}

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export type LiveShowShippingTerms = {
  shippingMode: LiveShowShippingMode;
  shippingCapCents: number | null;
  carrierPreference: LiveShowCarrierPreference;
  bundleEligiblePurchases: boolean;
  sellerPaysOverCap: boolean;
  shippingTermsVersion: number;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
};

export function shippingModeFromRoomFlags(room: {
  shippingMode?: LiveShowShippingMode | null;
  shippingCapEnabled?: boolean;
  freeShippingEnabled?: boolean;
}): LiveShowShippingMode {
  if (room.shippingMode === "calculated" || room.shippingMode === "capped" || room.shippingMode === "free") {
    return room.shippingMode;
  }
  if (room.freeShippingEnabled) return "free";
  if (room.shippingCapEnabled) return "capped";
  return "calculated";
}

export function roomFlagsFromShippingMode(mode: LiveShowShippingMode): {
  shippingCapEnabled: boolean;
  freeShippingEnabled: boolean;
} {
  if (mode === "free") return { shippingCapEnabled: false, freeShippingEnabled: true };
  if (mode === "capped") return { shippingCapEnabled: true, freeShippingEnabled: false };
  return { shippingCapEnabled: false, freeShippingEnabled: false };
}

export function liveShowShippingConfigFromTerms(terms: LiveShowShippingTerms): {
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
  shippingMode: LiveShowShippingMode;
  carrierPreference: LiveShowCarrierPreference;
  bundleEligiblePurchases: boolean;
  shippingTermsVersion: number;
} {
  const flags = roomFlagsFromShippingMode(terms.shippingMode);
  return {
    ...flags,
    // Calculated shows still honor the platform $9.99 buyer ceiling.
    shippingCapCents:
      terms.shippingMode === "free"
        ? null
        : resolveLiveShowShippingCapCents(terms.shippingCapCents),
    sellerPaysOverCap: terms.sellerPaysOverCap,
    shippingMode: terms.shippingMode,
    carrierPreference: terms.carrierPreference,
    bundleEligiblePurchases: terms.bundleEligiblePurchases,
    shippingTermsVersion: terms.shippingTermsVersion,
  };
}

export function defaultLiveShowShippingTerms(): LiveShowShippingTerms {
  return {
    shippingMode: "capped",
    shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
    carrierPreference: "best_rate",
    bundleEligiblePurchases: true,
    sellerPaysOverCap: true,
    shippingTermsVersion: 1,
    defaultShippingProfileId: null,
    defaultSellerShippingProfileId: null,
  };
}

/** Buyer-facing copy before purchase (capped shows). */
export function buyerLiveShippingPreviewCopy(args: {
  mode: LiveShowShippingMode;
  previewFromCents: number | null;
  capCents: number | null;
}): string {
  if (args.mode === "free") return "Free shipping";
  if (args.mode === "calculated") {
    const amt = args.previewFromCents ?? 0;
    return amt > 0 ? `Shipping: ${formatUsdFromCents(amt)} + taxes` : "Shipping calculated by destination";
  }
  const cap = resolveLiveShowShippingCapCents(args.capCents);
  const from = args.previewFromCents ?? 0;
  if (from > 0) return `Shipping from ${formatUsdFromCents(from)} · Max ${formatUsdFromCents(cap)} this show`;
  return `Shipping capped at ${formatUsdFromCents(cap)} this show`;
}

/** Buyer-facing copy after purchase. */
export function buyerLiveShippingPaidCopy(args: {
  mode: LiveShowShippingMode;
  paidCents: number;
  capCents: number | null;
  capReached: boolean;
}): string {
  if (args.mode === "free") return "Free shipping";
  // Once the per-show cap is paid, further eligible wins show as free shipping (not another add-on).
  if (args.capReached) return "Free shipping";
  if (args.mode === "calculated") {
    return args.paidCents > 0
      ? `Shipping: ${formatUsdFromCents(args.paidCents)} + taxes`
      : "Shipping calculated by destination";
  }
  const cap = resolveLiveShowShippingCapCents(args.capCents);
  const remaining = Math.max(0, cap - args.paidCents);
  return `Shipping paid: ${formatUsdFromCents(args.paidCents)} · ${formatUsdFromCents(remaining)} until cap`;
}

/** Paused HUD / show-level promise. */
export function buyerLiveShowShippingHudCopy(args: {
  mode: LiveShowShippingMode;
  capCents?: number | null;
}): string {
  if (args.mode === "free") return "Free shipping this show";
  if (args.mode === "calculated") return "Shipping calculated by destination";
  const cap = resolveLiveShowShippingCapCents(args.capCents);
  return `Shipping capped at ${formatUsdFromCents(cap)} this show`;
}

/** Seller-friendly capped shipping summary. */
export function sellerCappedShippingSummary(capCents?: number | null): string {
  const cap = formatUsdFromCents(resolveLiveShowShippingCapCents(capCents));
  return `Buyers pay a maximum of ${cap} shipping for this show. You cover any shipping above that amount.`;
}
