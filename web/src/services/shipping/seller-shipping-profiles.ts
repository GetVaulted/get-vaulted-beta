import type { PrismaClient } from "@/generated/prisma/client";
import type { LiveShowCarrierPreference } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { ProfileInput } from "@/lib/unified-shipping-engine";

export type SellerShippingProfileSeed = {
  sourceSlug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  packageType: string;
  bundleGroup: string;
  incrementalWeightOz?: number;
  maxUnitsPerParcel?: number;
  requiresSeparatePackage: boolean;
  canJoinBuyerShowShipment: boolean;
  carrierPreference: LiveShowCarrierPreference;
  defaultServicePreference?: string;
  isDefault?: boolean;
  sortOrder: number;
};

/** System default seller shipping profiles (one copy per seller, idempotent seed). */
export const SELLER_SHIPPING_PROFILE_SEEDS: SellerShippingProfileSeed[] = [
  {
    sourceSlug: "live_break_spot",
    name: "Live Break Spot / Card Mailer",
    defaultWeightOz: 4,
    defaultLengthIn: 6,
    defaultWidthIn: 4,
    defaultHeightIn: 1,
    packageType: "poly_mailer",
    bundleGroup: "cards",
    incrementalWeightOz: 1,
    maxUnitsPerParcel: 50,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    isDefault: true,
    sortOrder: 0,
  },
  {
    sourceSlug: "graded_card",
    name: "Graded Card",
    defaultWeightOz: 5,
    defaultLengthIn: 7,
    defaultWidthIn: 5,
    defaultHeightIn: 1,
    packageType: "bubble_mailer",
    bundleGroup: "cards",
    incrementalWeightOz: 2,
    maxUnitsPerParcel: 20,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 1,
  },
  {
    sourceSlug: "apparel",
    name: "Apparel",
    defaultWeightOz: 14,
    defaultLengthIn: 14,
    defaultWidthIn: 11,
    defaultHeightIn: 2,
    packageType: "poly_mailer",
    bundleGroup: "apparel",
    incrementalWeightOz: 4,
    maxUnitsPerParcel: 5,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 2,
  },
  {
    sourceSlug: "small_collectible",
    name: "Small Collectible",
    defaultWeightOz: 12,
    defaultLengthIn: 8,
    defaultWidthIn: 6,
    defaultHeightIn: 5,
    packageType: "box",
    bundleGroup: "collectibles",
    incrementalWeightOz: 2,
    maxUnitsPerParcel: 8,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 3,
  },
  {
    sourceSlug: "sealed_box",
    name: "Sealed Box",
    defaultWeightOz: 24,
    defaultLengthIn: 12,
    defaultWidthIn: 10,
    defaultHeightIn: 4,
    packageType: "box",
    bundleGroup: "boxes",
    incrementalWeightOz: 8,
    maxUnitsPerParcel: 3,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 4,
  },
  {
    sourceSlug: "mini_helmet",
    name: "Mini Helmet",
    defaultWeightOz: 24,
    defaultLengthIn: 10,
    defaultWidthIn: 8,
    defaultHeightIn: 8,
    packageType: "box",
    bundleGroup: "helmets_mini",
    maxUnitsPerParcel: 2,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 5,
  },
  {
    sourceSlug: "full_size_helmet",
    name: "Full-Size Helmet",
    defaultWeightOz: 80,
    defaultLengthIn: 16,
    defaultWidthIn: 14,
    defaultHeightIn: 12,
    packageType: "box",
    bundleGroup: "helmets_full",
    maxUnitsPerParcel: 1,
    requiresSeparatePackage: true,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    sortOrder: 6,
  },
  {
    sourceSlug: "oversized_fragile",
    name: "Oversized / Fragile",
    defaultWeightOz: 48,
    defaultLengthIn: 18,
    defaultWidthIn: 14,
    defaultHeightIn: 10,
    packageType: "box",
    bundleGroup: "oversized",
    maxUnitsPerParcel: 1,
    requiresSeparatePackage: true,
    canJoinBuyerShowShipment: false,
    carrierPreference: "best_rate",
    sortOrder: 7,
  },
];

type Db = Pick<
  PrismaClient,
  "sellerShippingProfile" | "liveRoom" | "liveRoomItem"
>;

export function sellerProfileToProfileInput(row: {
  id: string;
  sourceSlug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  bundleGroup: string;
  maxUnitsPerParcel: number | null;
  requiresSeparatePackage: boolean;
  canJoinBuyerShowShipment: boolean;
}): ProfileInput {
  return {
    id: row.id,
    slug: row.sourceSlug,
    name: row.name,
    defaultWeightOz: row.defaultWeightOz,
    defaultLengthIn: row.defaultLengthIn,
    defaultWidthIn: row.defaultWidthIn,
    defaultHeightIn: row.defaultHeightIn,
    bundleAllowed: row.canJoinBuyerShowShipment && !row.requiresSeparatePackage,
    requiresSeparatePackage: row.requiresSeparatePackage,
    bundleGroup: row.bundleGroup,
    maxUnitsPerParcel: row.maxUnitsPerParcel,
  };
}

/** Idempotent seed — never creates duplicates per seller + sourceSlug. */
export async function seedSellerShippingProfiles(
  sellerId: string,
  db: Db = prisma,
): Promise<{ count: number }> {
  let count = 0;
  for (const row of SELLER_SHIPPING_PROFILE_SEEDS) {
    await db.sellerShippingProfile.upsert({
      where: { sellerId_sourceSlug: { sellerId, sourceSlug: row.sourceSlug } },
      create: {
        sellerId,
        sourceSlug: row.sourceSlug,
        name: row.name,
        defaultWeightOz: row.defaultWeightOz,
        defaultLengthIn: row.defaultLengthIn,
        defaultWidthIn: row.defaultWidthIn,
        defaultHeightIn: row.defaultHeightIn,
        packageType: row.packageType,
        bundleGroup: row.bundleGroup,
        incrementalWeightOz: row.incrementalWeightOz ?? null,
        maxUnitsPerParcel: row.maxUnitsPerParcel ?? null,
        requiresSeparatePackage: row.requiresSeparatePackage,
        canJoinBuyerShowShipment: row.canJoinBuyerShowShipment,
        carrierPreference: row.carrierPreference,
        defaultServicePreference: row.defaultServicePreference ?? null,
        isDefault: row.isDefault === true,
      },
      update: {
        name: row.name,
        defaultWeightOz: row.defaultWeightOz,
        defaultLengthIn: row.defaultLengthIn,
        defaultWidthIn: row.defaultWidthIn,
        defaultHeightIn: row.defaultHeightIn,
        packageType: row.packageType,
        bundleGroup: row.bundleGroup,
        incrementalWeightOz: row.incrementalWeightOz ?? null,
        maxUnitsPerParcel: row.maxUnitsPerParcel ?? null,
        requiresSeparatePackage: row.requiresSeparatePackage,
        canJoinBuyerShowShipment: row.canJoinBuyerShowShipment,
      },
    });
    count += 1;
  }
  return { count };
}

export async function getActiveSellerShippingProfiles(sellerId: string, db: Db = prisma) {
  await seedSellerShippingProfiles(sellerId, db);
  return db.sellerShippingProfile.findMany({
    where: { sellerId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function resolveDefaultSellerProfileForLiveShow(args: {
  sellerId: string;
  showDefaultSellerProfileId?: string | null;
  db?: Db;
}) {
  const db = args.db ?? prisma;
  await seedSellerShippingProfiles(args.sellerId, db);
  if (args.showDefaultSellerProfileId?.trim()) {
    const explicit = await db.sellerShippingProfile.findFirst({
      where: {
        id: args.showDefaultSellerProfileId.trim(),
        sellerId: args.sellerId,
        archivedAt: null,
      },
    });
    if (explicit) return explicit;
  }
  return db.sellerShippingProfile.findFirst({
    where: { sellerId: args.sellerId, archivedAt: null, isDefault: true },
  });
}

export function sellerShippingProfileToProfileInput(profile: {
  id: string;
  sourceSlug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  bundleGroup: string;
  maxUnitsPerParcel?: number | null;
  requiresSeparatePackage: boolean;
  canJoinBuyerShowShipment: boolean;
}): ProfileInput {
  return {
    id: profile.id,
    slug: profile.sourceSlug,
    name: profile.name,
    defaultWeightOz: profile.defaultWeightOz,
    defaultLengthIn: profile.defaultLengthIn,
    defaultWidthIn: profile.defaultWidthIn,
    defaultHeightIn: profile.defaultHeightIn,
    bundleAllowed: profile.canJoinBuyerShowShipment && !profile.requiresSeparatePackage,
    requiresSeparatePackage: profile.requiresSeparatePackage,
    bundleGroup: profile.bundleGroup,
    maxUnitsPerParcel: profile.maxUnitsPerParcel ?? null,
  };
}

/** Break / team / spot commerce — item profile, then show default, then seeded break mailer. */
export async function resolveBreakSpotSellerProfile(args: {
  sellerId: string;
  showDefaultSellerProfileId?: string | null;
  itemSellerProfileId?: string | null;
  db?: Db;
}) {
  const db = args.db ?? prisma;
  await seedSellerShippingProfiles(args.sellerId, db);
  if (args.itemSellerProfileId?.trim()) {
    const byItem = await db.sellerShippingProfile.findFirst({
      where: {
        id: args.itemSellerProfileId.trim(),
        sellerId: args.sellerId,
        archivedAt: null,
      },
    });
    if (byItem) return byItem;
  }
  const showDefault = await resolveDefaultSellerProfileForLiveShow({
    sellerId: args.sellerId,
    showDefaultSellerProfileId: args.showDefaultSellerProfileId,
    db,
  });
  if (showDefault) return showDefault;
  return db.sellerShippingProfile.findFirst({
    where: { sellerId: args.sellerId, sourceSlug: "live_break_spot", archivedAt: null },
  });
}

export async function resolveSellerProfileForLiveRoomItem(args: {
  sellerId: string;
  sellerShippingProfileId?: string | null;
  showDefaultSellerProfileId?: string | null;
  db?: Db;
}) {
  const db = args.db ?? prisma;
  if (args.sellerShippingProfileId?.trim()) {
    const byItem = await db.sellerShippingProfile.findFirst({
      where: {
        id: args.sellerShippingProfileId.trim(),
        sellerId: args.sellerId,
        archivedAt: null,
      },
    });
    if (byItem) return byItem;
  }
  return resolveDefaultSellerProfileForLiveShow({
    sellerId: args.sellerId,
    showDefaultSellerProfileId: args.showDefaultSellerProfileId,
    db,
  });
}

export async function archiveSellerShippingProfile(args: {
  sellerId: string;
  profileId: string;
  db?: Db;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const db = args.db ?? prisma;
  const profile = await db.sellerShippingProfile.findFirst({
    where: { id: args.profileId, sellerId: args.sellerId, archivedAt: null },
  });
  if (!profile) return { ok: false, error: "Profile not found.", status: 404 };

  const inUse = await db.liveRoom.count({
    where: {
      sellerId: args.sellerId,
      status: { in: ["scheduled", "live"] },
      OR: [
        { defaultSellerShippingProfileId: profile.id },
        { items: { some: { sellerShippingProfileId: profile.id, status: { in: ["queued", "active"] } } } },
      ],
    },
  });
  if (inUse > 0) {
    return {
      ok: false,
      error: "This profile is used by a scheduled or live show. Archive it instead of deleting — it will stay on past sales.",
      status: 409,
    };
  }

  await db.sellerShippingProfile.update({
    where: { id: profile.id },
    data: { archivedAt: new Date(), isDefault: false },
  });
  return { ok: true };
}
