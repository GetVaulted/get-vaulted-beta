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
    defaultLengthIn: 8,
    defaultWidthIn: 6,
    defaultHeightIn: 1,
    packageType: "poly_mailer",
    bundleAllowed: true,
    requiresSeparatePackage: false,
    sortOrder: 0,
  },
  {
    slug: "graded_card",
    name: "Graded Card",
    defaultWeightOz: 8,
    defaultLengthIn: 10,
    defaultWidthIn: 8,
    defaultHeightIn: 2,
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
    defaultHeightIn: 3,
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
    defaultWeightOz: 16,
    defaultLengthIn: 10,
    defaultWidthIn: 8,
    defaultHeightIn: 6,
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

/** Split line items into package groups (helmets etc. ship alone; bundle-eligible items merge). */
export function groupItemsIntoPackages(
  items: Array<{ itemId: string; profile: ResolvedShippingProfile; quantity?: number }>,
): PackageGroup[] {
  const groups: PackageGroup[] = [];
  let bundleBucket: typeof items = [];

  const flushBundle = () => {
    if (bundleBucket.length === 0) return;
    let weightOz = 0;
    let maxL = 0;
    let maxW = 0;
    let maxH = 0;
    for (const row of bundleBucket) {
      const qty = Math.max(1, row.quantity ?? 1);
      weightOz += row.profile.weightOz * qty;
      maxL = Math.max(maxL, row.profile.lengthIn);
      maxW = Math.max(maxW, row.profile.widthIn);
      maxH = Math.max(maxH, row.profile.heightIn);
    }
    groups.push({
      packageIndex: groups.length,
      items: bundleBucket.map(({ itemId, profile }) => ({ itemId, profile })),
      weightOz: Math.max(1, weightOz),
      lengthIn: maxL || 10,
      widthIn: maxW || 8,
      heightIn: maxH || 4,
    });
    bundleBucket = [];
  };

  for (const row of items) {
    const qty = Math.max(1, row.quantity ?? 1);
    if (row.profile.requiresSeparatePackage || !row.profile.bundleAllowed) {
      flushBundle();
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
      for (let i = 0; i < qty; i++) {
        bundleBucket.push({ itemId: row.itemId, profile: row.profile, quantity: 1 });
      }
    }
  }
  flushBundle();
  return groups;
}

export type LiveShowShippingConfig = {
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
};

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
  const raw = Math.max(0, Math.floor(args.rawShippoEstimateCents));
  if (args.show.freeShippingEnabled) {
    return {
      buyerPaysCents: 0,
      rawEstimateCents: raw,
      sellerSubsidyCents: raw,
      shippingCapApplied: false,
      freeShippingApplied: true,
    };
  }

  let buyerPays = raw;
  let capApplied = false;
  if (args.show.shippingCapEnabled && args.show.shippingCapCents != null && args.show.shippingCapCents >= 0) {
    buyerPays = Math.min(raw, args.show.shippingCapCents);
    capApplied = raw > args.show.shippingCapCents;
  }

  const already = Math.max(0, Math.floor(args.alreadyChargedCents ?? 0));
  const incrementalBuyer = Math.max(0, buyerPays - already);
  const sellerSubsidy =
    args.show.sellerPaysOverCap && raw > buyerPays ? raw - buyerPays : 0;

  return {
    buyerPaysCents: incrementalBuyer,
    rawEstimateCents: raw,
    sellerSubsidyCents: sellerSubsidy,
    shippingCapApplied: capApplied,
    freeShippingApplied: false,
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

export function shippoRateAmountCents(rate: ShippoRateLike): number {
  const n = Number(rate.amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function pickCheapestShippoRate(rates: ShippoRateLike[]): ShippoRateLike | null {
  const filtered = filterShippoRatesUspsUps(rates);
  return filtered[0] ?? null;
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
