/**
 * Live show shipping — profile + tier model (Whatnot-style).
 * Marketplace checkout stays on full Shippo carrier selection; live orders use this layer.
 * Backend should map profiles/tiers to Shippo when purchasing; this module is product + UI truth.
 */

export type LiveShippingPreset = 'simplified' | 'advanced';

export type LiveShippingProfile = {
  id: string;
  label: string;
  subtitle: string;
  /** Typical packed weight for tier preview (oz). */
  nominalWeightOz: number;
  defaultDimsIn: { length: number; width: number; height: number };
  bundleEligibleDefault: boolean;
  maxBundleQuantity: number;
  domesticEligible: boolean;
  internationalEligible: boolean;
};

/** Curated seller profiles — expand / sync with seller settings later. */
export const LIVE_SHIPPING_PROFILES: readonly LiveShippingProfile[] = [
  {
    id: 'card_single',
    label: 'Trading card — single',
    subtitle: 'Toploader or one-touch',
    nominalWeightOz: 4,
    defaultDimsIn: { length: 6, width: 4, height: 1 },
    bundleEligibleDefault: true,
    maxBundleQuantity: 12,
    domesticEligible: true,
    internationalEligible: true,
  },
  {
    id: 'card_graded',
    label: 'Graded card',
    subtitle: 'PSA / BGS slab',
    nominalWeightOz: 5,
    defaultDimsIn: { length: 7, width: 5, height: 1 },
    bundleEligibleDefault: true,
    maxBundleQuantity: 8,
    domesticEligible: true,
    internationalEligible: true,
  },
  {
    id: 'apparel_tee',
    label: 'T-Shirt',
    subtitle: 'Soft goods · poly mailer',
    nominalWeightOz: 8,
    defaultDimsIn: { length: 12, width: 9, height: 2 },
    bundleEligibleDefault: true,
    maxBundleQuantity: 5,
    domesticEligible: true,
    internationalEligible: true,
  },
  {
    id: 'sneakers',
    label: 'Sneakers',
    subtitle: 'Shoe box',
    nominalWeightOz: 48,
    defaultDimsIn: { length: 14, width: 10, height: 6 },
    bundleEligibleDefault: false,
    maxBundleQuantity: 1,
    domesticEligible: true,
    internationalEligible: false,
  },
  {
    id: 'helmet',
    label: 'Helmet',
    subtitle: 'Full-size display',
    nominalWeightOz: 48,
    defaultDimsIn: { length: 14, width: 12, height: 12 },
    bundleEligibleDefault: false,
    maxBundleQuantity: 1,
    domesticEligible: true,
    internationalEligible: false,
  },
  {
    id: 'watch',
    label: 'Watch',
    subtitle: 'Box + cushion',
    nominalWeightOz: 8,
    defaultDimsIn: { length: 6, width: 4, height: 3 },
    bundleEligibleDefault: true,
    maxBundleQuantity: 3,
    domesticEligible: true,
    internationalEligible: true,
  },
  {
    id: 'hobby_box',
    label: 'Hobby box',
    subtitle: 'Sealed wax',
    nominalWeightOz: 16,
    defaultDimsIn: { length: 12, width: 10, height: 4 },
    bundleEligibleDefault: true,
    maxBundleQuantity: 6,
    domesticEligible: true,
    internationalEligible: true,
  },
] as const;

/** Monotonic tiers (oz). Combined cart weight maps to first tier where weight <= maxInclusiveOz. */
export const LIVE_BUNDLE_WEIGHT_TIERS_OZ: readonly { id: string; label: string; maxInclusiveOz: number }[] = [
  { id: 'z0', label: 'Up to 1 oz', maxInclusiveOz: 1 },
  { id: 'z1', label: 'Up to 3 oz', maxInclusiveOz: 3 },
  { id: 'z2', label: 'Up to 7 oz', maxInclusiveOz: 7 },
  { id: 'z3', label: 'Up to 11 oz', maxInclusiveOz: 11 },
  { id: 'z4', label: 'Up to 15 oz', maxInclusiveOz: 15 },
  { id: 'z5', label: 'Up to 1 lb', maxInclusiveOz: 16 },
  { id: 'z6', label: 'Up to 2 lb', maxInclusiveOz: 32 },
  { id: 'z7', label: 'Up to 3 lb', maxInclusiveOz: 48 },
  { id: 'z8', label: 'Up to 5 lb', maxInclusiveOz: 80 },
  { id: 'z9', label: 'Over 5 lb', maxInclusiveOz: 9999 },
] as const;

export function getLiveProfile(id: string | null): LiveShippingProfile | undefined {
  if (!id) return undefined;
  return LIVE_SHIPPING_PROFILES.find((p) => p.id === id);
}

/** Tier index for cumulative weight (buyer bundle engine). */
export function tierIndexForTotalWeightOz(totalOz: number): number {
  for (let i = 0; i < LIVE_BUNDLE_WEIGHT_TIERS_OZ.length; i++) {
    if (totalOz <= LIVE_BUNDLE_WEIGHT_TIERS_OZ[i].maxInclusiveOz) return i;
  }
  return LIVE_BUNDLE_WEIGHT_TIERS_OZ.length - 1;
}

/** Copy shown to buyers during live checkout (in-app rails; server sends final state). */
export const LIVE_BUYER_SHIPPING_MESSAGES = {
  bundled: "You're currently bundled — same show, same seller.",
  noExtraShipping: 'Add more eligible items with no additional shipping until the next weight tier.',
  tierUpgrade: 'Shipping upgraded to the next weight tier — more items in this bundle.',
  marketplaceSeparate: 'Marketplace orders ship separately — live show bundles never mix with the vault storefront.',
} as const;

export function liveShippingStepComplete(form: {
  liveShippingPreset: LiveShippingPreset;
  liveShippingProfileId: string | null;
  liveShipFromZip: string;
  liveBundleEligible: boolean;
  liveAdvancedWeightLb: string;
  liveAdvancedLengthIn: string;
  liveAdvancedWidthIn: string;
  liveAdvancedHeightIn: string;
}): boolean {
  if (!form.liveShippingProfileId?.trim()) return false;
  const zip = form.liveShipFromZip.replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return false;

  if (form.liveShippingPreset === 'advanced') {
    const w = Number(form.liveAdvancedWeightLb);
    const l = Number(form.liveAdvancedLengthIn);
    const wd = Number(form.liveAdvancedWidthIn);
    const h = Number(form.liveAdvancedHeightIn);
    if (!Number.isFinite(w) || w <= 0) return false;
    if (!Number.isFinite(l) || l <= 0) return false;
    if (!Number.isFinite(wd) || wd <= 0) return false;
    if (!Number.isFinite(h) || h <= 0) return false;
  }
  return true;
}
