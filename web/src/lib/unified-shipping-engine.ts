/** Admin-controlled platform shipping profile defaults (seed data). */

export type PlatformShippingProfileSeed = {
  slug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  packageType: string;
  bundleAllowed: boolean;
  requiresSeparatePackage: boolean;
  sortOrder: number;
};

export const PLATFORM_SHIPPING_PROFILE_SEEDS: PlatformShippingProfileSeed[] = [
  {
    slug: "trading_cards",
    name: "Trading Cards",
    defaultWeightOz: 4,
    defaultLengthIn: 6,
    defaultWidthIn: 4,
    defaultHeightIn: 1,
    packageType: "poly_mailer",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 0,
  },
  {
    slug: "graded_card",
    name: "Graded Card",
    defaultWeightOz: 5,
    defaultLengthIn: 7,
    defaultWidthIn: 5,
    defaultHeightIn: 1,
    packageType: "bubble_mailer",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 1,
  },
  {
    slug: "card_lot",
    name: "Card Lot",
    defaultWeightOz: 12,
    defaultLengthIn: 10,
    defaultWidthIn: 8,
    defaultHeightIn: 3,
    packageType: "box",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 2,
  },
  {
    slug: "jersey",
    name: "Jersey",
    defaultWeightOz: 16,
    defaultLengthIn: 14,
    defaultWidthIn: 11,
    defaultHeightIn: 2,
    packageType: "poly_mailer",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 3,
  },
  {
    slug: "mini_helmet",
    name: "Mini Helmet",
    defaultWeightOz: 24,
    defaultLengthIn: 10,
    defaultWidthIn: 8,
    defaultHeightIn: 8,
    packageType: "box",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 4,
  },
  {
    slug: "full_size_helmet",
    name: "Full Size Helmet",
    defaultWeightOz: 80,
    defaultLengthIn: 16,
    defaultWidthIn: 14,
    defaultHeightIn: 12,
    packageType: "box",
    bundleAllowed: false,
    requiresSeparatePackage: true,
    sortOrder: 5,
  },
  {
    slug: "speedflex_helmet",
    name: "SpeedFlex Helmet",
    defaultWeightOz: 96,
    defaultLengthIn: 16,
    defaultWidthIn: 14,
    defaultHeightIn: 14,
    packageType: "box",
    bundleAllowed: false,
    requiresSeparatePackage: true,
    sortOrder: 6,
  },
  {
    slug: "sneakers",
    name: "Sneakers",
    defaultWeightOz: 48,
    defaultLengthIn: 14,
    defaultWidthIn: 10,
    defaultHeightIn: 6,
    packageType: "box",
    bundleAllowed: false,
    requiresSeparatePackage: true,
    sortOrder: 7,
  },
  {
    slug: "watch",
    name: "Watch",
    defaultWeightOz: 8,
    defaultLengthIn: 6,
    defaultWidthIn: 4,
    defaultHeightIn: 3,
    packageType: "small_box",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 8,
  },
  {
    slug: "funko_collectible",
    name: "Funko / Collectible",
    defaultWeightOz: 14,
    defaultLengthIn: 8,
    defaultWidthIn: 6,
    defaultHeightIn: 7,
    packageType: "box",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 9,
  },
  {
    slug: "custom",
    name: "Custom",
    defaultWeightOz: 16,
    defaultLengthIn: 12,
    defaultWidthIn: 9,
    defaultHeightIn: 4,
    packageType: "",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 10,
  },
];

/** Map live room / listing category strings to suggested profile slugs. */
export function suggestShippingProfileSlugForCategory(category: string | null | undefined): string {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return "trading_cards";
  if (c.includes("graded") || c.includes("slab")) return "graded_card";
  if (c.includes("mini") && c.includes("helmet")) return "mini_helmet";
  if (c.includes("speedflex")) return "speedflex_helmet";
  if (c.includes("helmet")) return "full_size_helmet";
  if (c.includes("lot") || (c.includes("break") && !c.includes("helmet"))) return "card_lot";
  if (c.includes("jersey") || c.includes("apparel")) return "jersey";
  if (c.includes("sneaker") || c.includes("shoe")) return "sneakers";
  if (c.includes("watch")) return "watch";
  if (c.includes("funko") || c.includes("collectible")) return "funko_collectible";
  if (c.includes("card")) return "trading_cards";
  return "trading_cards";
}

export type ResolvedShippingProfile = {
  id: string;
  slug: string;
  name: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  bundleAllowed: boolean;
  requiresSeparatePackage: boolean;
  bundleGroup: string;
  maxUnitsPerParcel: number | null;
};

export type ProfileInput = {
  id: string;
  slug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  bundleAllowed: boolean;
  requiresSeparatePackage: boolean;
  bundleGroup?: string;
  maxUnitsPerParcel?: number | null;
};

export type ItemProfileOverride = {
  customWeightOz?: number | null;
  customLengthIn?: number | null;
  customWidthIn?: number | null;
  customHeightIn?: number | null;
  requiresSeparatePackage?: boolean | null;
};

export function resolveShippingProfileDimensions(
  profile: ProfileInput,
  overrides?: ItemProfileOverride | null,
): ResolvedShippingProfile {
  const pick = (custom: number | null | undefined, fallback: number) =>
    typeof custom === "number" && Number.isFinite(custom) && custom > 0 ? custom : fallback;
  const separate =
    overrides?.requiresSeparatePackage != null
      ? overrides.requiresSeparatePackage
      : profile.requiresSeparatePackage;
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    weightOz: pick(overrides?.customWeightOz, profile.defaultWeightOz),
    lengthIn: pick(overrides?.customLengthIn, profile.defaultLengthIn),
    widthIn: pick(overrides?.customWidthIn, profile.defaultWidthIn),
    heightIn: pick(overrides?.customHeightIn, profile.defaultHeightIn),
    bundleAllowed: profile.bundleAllowed && !separate,
    requiresSeparatePackage: separate,
    bundleGroup: profile.bundleGroup?.trim() || profile.slug || "general",
    maxUnitsPerParcel:
      profile.maxUnitsPerParcel != null && profile.maxUnitsPerParcel > 0
        ? profile.maxUnitsPerParcel
        : null,
  };
}

export type PackageGroup = {
  packageIndex: number;
  items: Array<{ itemId: string; profile: ResolvedShippingProfile }>;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

/** Split line items into package groups (helmets etc. ship alone; bundle-eligible items merge by bundle group). */
export function groupItemsIntoPackages(
  items: Array<{ itemId: string; profile: ResolvedShippingProfile; quantity?: number }>,
  opts?: { bundleEligiblePurchases?: boolean },
): PackageGroup[] {
  const groups: PackageGroup[] = [];
  const bundleBuckets = new Map<string, typeof items>();

  const flushBundleGroup = (groupKey: string) => {
    const bucket = bundleBuckets.get(groupKey);
    if (!bucket || bucket.length === 0) return;
    let weightOz = 0;
    let maxL = 0;
    let maxW = 0;
    let maxH = 0;
    const maxUnits = bucket[0]?.profile.maxUnitsPerParcel;
    const limited = maxUnits != null && maxUnits > 0 ? bucket.slice(0, maxUnits) : bucket;
    const overflow = maxUnits != null && maxUnits > 0 ? bucket.slice(maxUnits) : [];
    for (const row of limited) {
      const qty = Math.max(1, row.quantity ?? 1);
      weightOz += row.profile.weightOz * qty;
      maxL = Math.max(maxL, row.profile.lengthIn);
      maxW = Math.max(maxW, row.profile.widthIn);
      maxH = Math.max(maxH, row.profile.heightIn);
    }
    groups.push({
      packageIndex: groups.length,
      items: limited.map(({ itemId, profile }) => ({ itemId, profile })),
      weightOz: Math.max(1, weightOz),
      lengthIn: maxL || 10,
      widthIn: maxW || 8,
      heightIn: maxH || 4,
    });
    bundleBuckets.delete(groupKey);
    if (overflow.length > 0) {
      for (const row of overflow) {
        groups.push({
          packageIndex: groups.length,
          items: [{ itemId: row.itemId, profile: row.profile }],
          weightOz: row.profile.weightOz,
          lengthIn: row.profile.lengthIn,
          widthIn: row.profile.widthIn,
          heightIn: row.profile.heightIn,
        });
      }
    }
  };

  const flushAllBundles = () => {
    for (const key of [...bundleBuckets.keys()]) flushBundleGroup(key);
  };

  const bundlingEnabled = opts?.bundleEligiblePurchases !== false;

  for (const row of items) {
    const qty = Math.max(1, row.quantity ?? 1);
    if (
      !bundlingEnabled ||
      row.profile.requiresSeparatePackage ||
      !row.profile.bundleAllowed
    ) {
      flushAllBundles();
      for (let i = 0; i < qty; i++) {
        groups.push({
          packageIndex: groups.length,
          items: [{ itemId: row.itemId, profile: row.profile }],
          weightOz: row.profile.weightOz,
          lengthIn: row.profile.lengthIn,
          widthIn: row.profile.widthIn,
          heightIn: row.profile.heightIn,
        });
      }
    } else {
      const groupKey = row.profile.bundleGroup || "general";
      const bucket = bundleBuckets.get(groupKey) ?? [];
      for (let i = 0; i < qty; i++) {
        bucket.push({ itemId: row.itemId, profile: row.profile, quantity: 1 });
      }
      bundleBuckets.set(groupKey, bucket);
    }
  }
  flushAllBundles();
  return groups;
}

export type LiveShowShippingConfig = {
  shippingMode?: "calculated" | "capped" | "free";
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
  bundleEligiblePurchases?: boolean;
};

/** Compute buyer total and incremental charge for a live show purchase. */
export function computeBuyerLiveShippingTotals(args: {
  shippingMode: "calculated" | "capped" | "free";
  shippingCapCents: number | null;
  sellerPaysOverCap: boolean;
  estimatedEligibleBundleShippingCents: number;
  shippingAlreadyChargedCents: number;
}): {
  buyerTotalShippingCents: number;
  shippingDueForThisPurchaseCents: number;
  sellerShippingSubsidyCents: number;
  capReached: boolean;
  freeShippingApplied: boolean;
} {
  const raw = Math.max(0, Math.floor(args.estimatedEligibleBundleShippingCents));
  const already = Math.max(0, Math.floor(args.shippingAlreadyChargedCents));

  if (args.shippingMode === "free") {
    return {
      buyerTotalShippingCents: 0,
      shippingDueForThisPurchaseCents: 0,
      sellerShippingSubsidyCents: raw,
      capReached: false,
      freeShippingApplied: true,
    };
  }

  const cap =
    args.shippingMode === "capped" && args.shippingCapCents != null
      ? Math.max(0, Math.floor(args.shippingCapCents))
      : null;

  const buyerTotalShippingCents =
    args.shippingMode === "capped" && cap != null ? Math.min(cap, raw) : raw;

  const shippingDueForThisPurchaseCents = Math.max(0, buyerTotalShippingCents - already);
  const sellerShippingSubsidyCents =
    args.sellerPaysOverCap && raw > buyerTotalShippingCents ? raw - buyerTotalShippingCents : 0;

  return {
    buyerTotalShippingCents,
    shippingDueForThisPurchaseCents,
    sellerShippingSubsidyCents,
    capReached: cap != null && buyerTotalShippingCents >= cap,
    freeShippingApplied: false,
  };
}

export type BuyerShippingChargeResult = {
  buyerPaysCents: number;
  rawEstimateCents: number;
  sellerSubsidyCents: number;
  shippingCapApplied: boolean;
  freeShippingApplied: boolean;
};

/** Compute what the buyer pays vs seller subsidy for live bundled shipping. */
export function computeLiveBuyerShippingCharge(args: {
  rawShippoEstimateCents: number;
  show: LiveShowShippingConfig;
  alreadyChargedCents?: number;
}): BuyerShippingChargeResult {
  const mode =
    args.show.shippingMode ??
    (args.show.freeShippingEnabled ? "free" : args.show.shippingCapEnabled ? "capped" : "calculated");

  const totals = computeBuyerLiveShippingTotals({
    shippingMode: mode,
    shippingCapCents: args.show.shippingCapCents,
    sellerPaysOverCap: args.show.sellerPaysOverCap,
    estimatedEligibleBundleShippingCents: args.rawShippoEstimateCents,
    shippingAlreadyChargedCents: args.alreadyChargedCents ?? 0,
  });

  return {
    buyerPaysCents: totals.shippingDueForThisPurchaseCents,
    rawEstimateCents: Math.max(0, Math.floor(args.rawShippoEstimateCents)),
    sellerSubsidyCents: totals.sellerShippingSubsidyCents,
    shippingCapApplied: totals.capReached,
    freeShippingApplied: totals.freeShippingApplied,
  };
}

export type ShippoRateLike = {
  object_id?: string;
  amount?: string;
  provider?: string;
  servicelevel?: { token?: string; name?: string };
};

const ALLOWED_CARRIERS = new Set(["usps", "ups"]);

export function normalizeCarrierKey(provider: string | null | undefined): string {
  const p = (provider ?? "").trim().toLowerCase();
  if (p.includes("usps") || p === "usps") return "usps";
  if (p.includes("ups") || p === "ups") return "ups";
  return p;
}

/** Filter Shippo rates to USPS + UPS only; sort cheapest first. */
export function filterShippoRatesUspsUps(rates: ShippoRateLike[]): ShippoRateLike[] {
  return rates
    .filter((r) => {
      const key = normalizeCarrierKey(r.provider);
      return ALLOWED_CARRIERS.has(key);
    })
    .sort((a, b) => {
      const aa = Number(a.amount);
      const bb = Number(b.amount);
      if (!Number.isFinite(aa)) return 1;
      if (!Number.isFinite(bb)) return -1;
      return aa - bb;
    });
}

/**
 * Seller quote list: cheapest USPS + cheapest UPS first (so UPS isn't buried),
 * then remaining USPS/UPS services by price.
 */
export function selectShippoRatesForSellerQuote(
  rates: ShippoRateLike[],
  maxRates = 8,
): ShippoRateLike[] {
  const allowed = filterShippoRatesUspsUps(rates);
  if (allowed.length === 0) return [];

  const cheapestByCarrier = new Map<string, ShippoRateLike>();
  for (const rate of allowed) {
    const key = normalizeCarrierKey(rate.provider);
    if (!cheapestByCarrier.has(key)) cheapestByCarrier.set(key, rate);
  }

  const featured = [...cheapestByCarrier.values()].sort((a, b) => {
    const aa = Number(a.amount);
    const bb = Number(b.amount);
    if (!Number.isFinite(aa)) return 1;
    if (!Number.isFinite(bb)) return -1;
    return aa - bb;
  });

  const featuredIds = new Set(
    featured.map((r, i) => r.object_id ?? `featured-${normalizeCarrierKey(r.provider)}-${i}`),
  );
  const rest = allowed.filter((r, i) => {
    const id = r.object_id ?? `rest-${normalizeCarrierKey(r.provider)}-${i}`;
    return !featuredIds.has(id) && !(r.object_id && featured.some((f) => f.object_id === r.object_id));
  });

  return [...featured, ...rest].slice(0, Math.max(1, maxRates));
}

export type LiveShowCarrierPreferenceFilter = "usps" | "ups" | "best_rate";

/** Restrict Shippo rates to seller/show carrier preference. */
export function filterShippoRatesByCarrierPreference(
  rates: ShippoRateLike[],
  preference: LiveShowCarrierPreferenceFilter,
): ShippoRateLike[] {
  const allowed = filterShippoRatesUspsUps(rates);
  if (preference === "best_rate") return allowed;
  return allowed.filter((r) => normalizeCarrierKey(r.provider) === preference);
}

export function pickShippoRateForPreference(
  rates: ShippoRateLike[],
  preference: LiveShowCarrierPreferenceFilter,
): ShippoRateLike | null {
  const filtered = filterShippoRatesByCarrierPreference(rates, preference);
  return filtered[0] ?? null;
}

export function shippoRateAmountCents(rate: ShippoRateLike): number {
  const n = Number(rate.amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function pickCheapestShippoRate(rates: ShippoRateLike[]): ShippoRateLike | null {
  return pickShippoRateForPreference(rates, "best_rate");
}

/** Label lock — shipment cannot change profile/dims once any package has a label. */
export function shipmentProfileEditLocked(packages: Array<{ shippoTransactionId?: string | null; labelUrl?: string | null; status?: string }>): boolean {
  return packages.some(
    (p) =>
      p.status === "label_created" ||
      Boolean(p.shippoTransactionId?.trim()) ||
      Boolean(p.labelUrl?.trim()),
  );
}

export type ShowShippingLiability = {
  buyerShippingCapCents: number | null;
  freeShippingEnabled: boolean;
  ordersCount: number;
  buyersCount: number;
  collectedCents: number;
  estimatedLabelCostCents: number;
  sellerSubsidyCents: number;
  netCents: number;
  capWarning: boolean;
};

export function computeShowShippingLiability(args: {
  show: LiveShowShippingConfig;
  sessions: Array<{
    shippingCostCents: number;
    estimatedLabelCostCents: number | null;
    sellerShippingSubsidyCents: number;
    buyerId: string;
  }>;
}): ShowShippingLiability {
  const collected = args.sessions.reduce((s, x) => s + Math.max(0, x.shippingCostCents), 0);
  const estimatedLabel = args.sessions.reduce(
    (s, x) => s + Math.max(0, x.estimatedLabelCostCents ?? 0),
    0,
  );
  const subsidy = args.sessions.reduce(
    (s, x) => s + Math.max(0, x.sellerShippingSubsidyCents),
    0,
  );
  const net = collected - estimatedLabel;
  const buyers = new Set(args.sessions.map((s) => s.buyerId));
  return {
    buyerShippingCapCents: args.show.shippingCapEnabled ? args.show.shippingCapCents : null,
    freeShippingEnabled: args.show.freeShippingEnabled,
    ordersCount: args.sessions.length,
    buyersCount: buyers.size,
    collectedCents: collected,
    estimatedLabelCostCents: estimatedLabel,
    sellerSubsidyCents: subsidy,
    netCents: net,
    capWarning: net < 0 || (args.show.shippingCapEnabled && subsidy > 0),
  };
}

export function serializeProfileSnapshot(profile: ResolvedShippingProfile): string {
  return JSON.stringify({
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    weightOz: profile.weightOz,
    lengthIn: profile.lengthIn,
    widthIn: profile.widthIn,
    heightIn: profile.heightIn,
    bundleAllowed: profile.bundleAllowed,
    requiresSeparatePackage: profile.requiresSeparatePackage,
    capturedAt: new Date().toISOString(),
  });
}
