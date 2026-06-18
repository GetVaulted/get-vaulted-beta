import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PLATFORM_SHIPPING_PROFILE_SEEDS,
  suggestShippingProfileSlugForCategory,
} from "@/lib/unified-shipping-engine";

export { PLATFORM_SHIPPING_PROFILE_SEEDS, suggestShippingProfileSlugForCategory };

type Db = Pick<PrismaClient, "platformShippingProfile">;

/** Upsert admin-controlled platform shipping profiles (idempotent). */
export async function seedPlatformShippingProfiles(db: Db = prisma): Promise<{ count: number }> {
  let count = 0;
  for (const row of PLATFORM_SHIPPING_PROFILE_SEEDS) {
    await db.platformShippingProfile.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        name: row.name,
        defaultWeightOz: row.defaultWeightOz,
        defaultLengthIn: row.defaultLengthIn,
        defaultWidthIn: row.defaultWidthIn,
        defaultHeightIn: row.defaultHeightIn,
        packageType: row.packageType,
        bundleAllowed: row.bundleAllowed,
        requiresSeparatePackage: row.requiresSeparatePackage,
        isActive: true,
        sortOrder: row.sortOrder,
      },
      update: {
        name: row.name,
        defaultWeightOz: row.defaultWeightOz,
        defaultLengthIn: row.defaultLengthIn,
        defaultWidthIn: row.defaultWidthIn,
        defaultHeightIn: row.defaultHeightIn,
        packageType: row.packageType,
        bundleAllowed: row.bundleAllowed,
        requiresSeparatePackage: row.requiresSeparatePackage,
        sortOrder: row.sortOrder,
      },
    });
    count += 1;
  }
  return { count };
}

export async function getActivePlatformShippingProfiles(db: Db = prisma) {
  return db.platformShippingProfile.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function resolvePlatformProfileBySlug(slug: string, db: Db = prisma) {
  return db.platformShippingProfile.findFirst({
    where: { slug, isActive: true },
  });
}

export async function resolvePlatformProfileForListing(args: {
  platformShippingProfileId?: string | null;
  platformShippingProfileSlug?: string | null;
  category?: string | null;
  db?: Db;
}) {
  const db = args.db ?? prisma;
  if (args.platformShippingProfileId?.trim()) {
    const byId = await db.platformShippingProfile.findFirst({
      where: { id: args.platformShippingProfileId.trim(), isActive: true },
    });
    if (byId) return byId;
  }
  if (args.platformShippingProfileSlug?.trim()) {
    const bySlug = await resolvePlatformProfileBySlug(args.platformShippingProfileSlug.trim(), db);
    if (bySlug) return bySlug;
  }
  const slug = suggestShippingProfileSlugForCategory(args.category);
  return resolvePlatformProfileBySlug(slug, db);
}

export async function resolveDefaultProfileForLiveShow(args: {
  showDefaultProfileId?: string | null;
  category?: string | null;
  db?: Db;
}) {
  const db = args.db ?? prisma;
  if (args.showDefaultProfileId?.trim()) {
    const explicit = await db.platformShippingProfile.findFirst({
      where: { id: args.showDefaultProfileId.trim(), isActive: true },
    });
    if (explicit) return explicit;
  }
  const slug = suggestShippingProfileSlugForCategory(args.category);
  return resolvePlatformProfileBySlug(slug, db);
}
