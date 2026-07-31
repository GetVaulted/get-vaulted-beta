import type { PrismaClient } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import {
  computeLiveBuyerShippingCharge,
  computeBuyerLiveShippingTotals,
  groupItemsIntoPackages,
  resolveShippingProfileDimensions,
  type LiveShowShippingConfig,
  type PackageGroup,
} from "@/lib/unified-shipping-engine";
import { buildLiveShowShippingConfig, PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS } from "@/lib/live-show-shipping-terms";
import { LIVE_BUNDLED_SHIPPING_DESTINATION_KEY } from "@/services/shipping/live-shipping-pricing";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import {
  resolveBreakSpotSellerProfile,
  sellerProfileToProfileInput,
} from "@/services/shipping/seller-shipping-profiles";
import { tierFallbackCentsForPackageGroups } from "@/services/shipping/live-shipping-tier-estimate";

type Db = Pick<
  PrismaClient,
  | "liveRoom"
  | "liveRoomItem"
  | "liveShippingSession"
  | "liveShippingSessionItem"
  | "liveAuctionInventoryHold"
  | "platformShippingProfile"
  | "sellerShippingProfile"
  | "listing"
>;

const LIVE_ITEM_SHIPPING_SELECT = {
  id: true,
  listingId: true,
  shippingProfileId: true,
  sellerShippingProfileId: true,
  customWeightOz: true,
  customLengthIn: true,
  customWidthIn: true,
  customHeightIn: true,
  requiresSeparatePackage: true,
  shippingProfile: true,
  sellerShippingProfile: true,
} as const;

/**
 * Resolve the queue-row shipping profile for a session order.
 * Break/multi-unit wins create ephemeral listings that do not match `LiveRoomItem.listingId`,
 * so fall back through the inventory hold that still points at the host liveRoomItem.
 */
export async function resolveLiveRoomItemForSessionOrder(
  db: Db | TransactionClient,
  args: { liveShowId: string; listingId: string; orderId: string },
) {
  const byListing = await db.liveRoomItem.findFirst({
    where: { liveRoomId: args.liveShowId, listingId: args.listingId },
    orderBy: { updatedAt: "desc" },
    select: LIVE_ITEM_SHIPPING_SELECT,
  });
  if (byListing) return byListing;

  const hold = await db.liveAuctionInventoryHold.findFirst({
    where: {
      liveRoomItemId: { not: null },
      liveRoomItem: { liveRoomId: args.liveShowId },
      OR: [{ orderId: args.orderId }, { listingId: args.listingId }],
    },
    orderBy: { updatedAt: "desc" },
    select: { liveRoomItemId: true },
  });
  if (!hold?.liveRoomItemId) return null;

  return db.liveRoomItem.findFirst({
    where: { id: hold.liveRoomItemId, liveRoomId: args.liveShowId },
    select: LIVE_ITEM_SHIPPING_SELECT,
  });
}

export type BuyerShippingPoolTotals = {
  rawEstimateCents: number;
  buyerTotalCents: number;
  packageCount: number;
  separatePackageCount: number;
  capCents: number | null;
  capReached: boolean;
  freeShippingApplied: boolean;
  sellerSubsidyCents: number;
  pricingWeightOz: number;
};

export function liveShowShippingConfigFromRoom(room: {
  shippingMode?: "calculated" | "capped" | "free" | null;
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
  carrierPreference?: "usps" | "ups" | "best_rate" | null;
  bundleEligiblePurchases?: boolean | null;
  shippingTermsVersion?: number | null;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
}): LiveShowShippingConfig {
  const cfg = buildLiveShowShippingConfig(room);
  return {
    shippingMode: cfg.shippingMode,
    shippingCapEnabled: cfg.shippingCapEnabled,
    shippingCapCents: cfg.shippingCapCents,
    freeShippingEnabled: cfg.freeShippingEnabled,
    sellerPaysOverCap: cfg.sellerPaysOverCap,
    bundleEligiblePurchases: cfg.bundleEligiblePurchases,
  };
}

type ProfileRow = {
  itemId: string;
  profile: Parameters<typeof resolveShippingProfileDimensions>[0];
  overrides?: Parameters<typeof resolveShippingProfileDimensions>[1];
};

/**
 * Already-charged session items keep the weight frozen at settle time.
 * Re-resolving today's seller/platform profile (e.g. Helmets → separate 80oz box) would
 * inflate the pool and claw back the difference on the buyer's next win via
 * `max(0, newPool − alreadyCharged)`. Use this nestable parcel so past purchases only
 * contribute their charged weight.
 */
export function frozenPriorPurchaseProfileRow(args: {
  itemId: string;
  appliedWeightOz: number;
}): ProfileRow {
  const weightOz = Math.max(1, args.appliedWeightOz);
  return {
    itemId: args.itemId,
    profile: {
      id: `frozen:${args.itemId}`,
      slug: "session_frozen",
      name: "Prior purchase",
      defaultWeightOz: weightOz,
      defaultLengthIn: 6,
      defaultWidthIn: 4,
      defaultHeightIn: 1,
      bundleAllowed: true,
      requiresSeparatePackage: false,
      bundleGroup: "session_frozen",
    },
  };
}

export async function resolveLiveRoomItemShippingProfile(
  liveRoomItemId: string,
  db: Db | TransactionClient = prisma,
) {
  const item = await db.liveRoomItem.findUnique({
    where: { id: liveRoomItemId },
    select: {
      id: true,
      shippingProfileId: true,
      sellerShippingProfileId: true,
      customWeightOz: true,
      customLengthIn: true,
      customWidthIn: true,
      customHeightIn: true,
      requiresSeparatePackage: true,
      shippingProfile: true,
      sellerShippingProfile: true,
      liveRoom: {
        select: {
          sellerId: true,
          defaultShippingProfileId: true,
          defaultSellerShippingProfileId: true,
          category: true,
        },
      },
    },
  });
  if (!item) return null;

  // Seller profiles win (card mailer vs helmet by show category). Never prefer a stale
  // platform card_lot weight when the show is a Helmets break under the $9.99 cap.
  const sellerResolved = await resolveBreakSpotSellerProfile({
    sellerId: item.liveRoom.sellerId,
    showDefaultSellerProfileId: item.liveRoom.defaultSellerShippingProfileId,
    itemSellerProfileId: item.sellerShippingProfileId,
    category: item.liveRoom.category,
    db: db as Db,
  });
  if (sellerResolved) {
    const profile = sellerProfileToProfileInput(sellerResolved);
    return {
      itemId: item.id,
      profile,
      overrides: item,
      resolved: resolveShippingProfileDimensions(profile, item),
    };
  }

  const profile =
    item.shippingProfile ??
    (await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: item.liveRoom.defaultShippingProfileId,
      category: item.liveRoom.category,
      db: db as Db,
    }));
  if (!profile) return null;

  return {
    itemId: item.id,
    profile,
    overrides: item,
    resolved: resolveShippingProfileDimensions(profile, item),
  };
}

async function profileRowsForSession(sessionId: string, db: Db | TransactionClient): Promise<ProfileRow[]> {
  const session = await db.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      liveShowId: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: { orderId: true, listingId: true, appliedWeightOz: true },
      },
      liveShow: { select: { defaultShippingProfileId: true, category: true } },
    },
  });
  if (!session) return [];

  const rows: ProfileRow[] = [];
  for (const si of session.items) {
    const appliedWeightOz =
      Number.isFinite(si.appliedWeightOz) && si.appliedWeightOz > 0 ? si.appliedWeightOz : null;
    const liveItem = await resolveLiveRoomItemForSessionOrder(db, {
      liveShowId: session.liveShowId,
      listingId: si.listingId,
      orderId: si.orderId,
    });
    const itemId = liveItem?.id ?? si.orderId;

    // Past purchases: never re-price with today's profile mapping.
    if (appliedWeightOz != null) {
      rows.push(frozenPriorPurchaseProfileRow({ itemId, appliedWeightOz }));
      continue;
    }

    // Prefer the same seller→platform resolution as win-preview / charge (never platform-only).
    if (liveItem) {
      const resolved = await resolveLiveRoomItemShippingProfile(liveItem.id, db);
      if (resolved) {
        rows.push({
          itemId: resolved.itemId,
          profile: resolved.profile,
          overrides: resolved.overrides,
        });
        continue;
      }
    }

    const listing = await db.listing.findUnique({
      where: { id: si.listingId },
      select: {
        shippingBaseWeightOz: true,
        parcelWeightOz: true,
        parcelLengthIn: true,
        parcelWidthIn: true,
        parcelHeightIn: true,
        shippingCategory: true,
      },
    });
    if (listing) {
      const parcelWeight =
        listing.parcelWeightOz != null && Number.isFinite(listing.parcelWeightOz) && listing.parcelWeightOz > 0
          ? listing.parcelWeightOz
          : null;
      const baseWeight =
        listing.shippingBaseWeightOz != null &&
        Number.isFinite(listing.shippingBaseWeightOz) &&
        listing.shippingBaseWeightOz > 0
          ? listing.shippingBaseWeightOz
          : null;
      const weightOz = parcelWeight ?? baseWeight ?? 4;
      rows.push({
        itemId,
        profile: {
          id: `listing:${si.listingId}`,
          slug: listing.shippingCategory ?? "live_spot",
          name: "Live spot",
          defaultWeightOz: weightOz,
          defaultLengthIn: listing.parcelLengthIn ?? 8,
          defaultWidthIn: listing.parcelWidthIn ?? 6,
          defaultHeightIn: listing.parcelHeightIn ?? 1,
          bundleGroup: "general",
          bundleAllowed: !(liveItem?.requiresSeparatePackage === true),
          requiresSeparatePackage: liveItem?.requiresSeparatePackage === true,
        },
        overrides: liveItem ?? undefined,
      });
      continue;
    }
    const fallback = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: session.liveShow.defaultShippingProfileId,
      category: session.liveShow.category,
      db: db as Db,
    });
    if (fallback) {
      rows.push({
        itemId,
        profile: fallback,
        overrides: liveItem ?? undefined,
      });
    }
  }
  return rows;
}

export function packageGroupsFromProfileRows(
  rows: ProfileRow[],
  show?: LiveShowShippingConfig,
): PackageGroup[] {
  return groupItemsIntoPackages(
    rows.map((r) => ({
      itemId: r.itemId,
      profile: resolveShippingProfileDimensions(r.profile, r.overrides),
    })),
    { bundleEligiblePurchases: show?.bundleEligiblePurchases },
  );
}

export function computePoolTotalsFromGroups(
  groups: PackageGroup[],
  show: LiveShowShippingConfig,
  rawOverrideCents?: number | null,
): BuyerShippingPoolTotals {
  const rawEstimateCents =
    rawOverrideCents != null && Number.isFinite(rawOverrideCents) && rawOverrideCents >= 0
      ? Math.floor(rawOverrideCents)
      : tierFallbackCentsForPackageGroups(groups);
  const charge = computeLiveBuyerShippingCharge({
    rawShippoEstimateCents: rawEstimateCents,
    show,
    alreadyChargedCents: 0,
  });

  // Always go through charge math so calculated mode still hits the $9.99 platform max.
  // rawEstimateCents must stay uncapped (Shippo or tier); buyerTotalCents is the capped session total.
  const buyerTotalCents = charge.buyerPaysCents;
  const mode =
    show.shippingMode ??
    (show.freeShippingEnabled ? "free" : show.shippingCapEnabled ? "capped" : "calculated");
  const totalsMeta = computeBuyerLiveShippingTotals({
    shippingMode: mode,
    shippingCapCents: show.shippingCapCents,
    sellerPaysOverCap: show.sellerPaysOverCap,
    estimatedEligibleBundleShippingCents: rawEstimateCents,
    shippingAlreadyChargedCents: 0,
  });
  const capCents = charge.freeShippingApplied
    ? null
    : Math.min(
        show.shippingCapCents != null && Number.isFinite(show.shippingCapCents)
          ? Math.max(0, Math.floor(show.shippingCapCents))
          : PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS,
        PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS,
      );
  const capReached = totalsMeta.capReached;

  const separatePackageCount = groups.filter((g) =>
    g.items.some((i) => i.profile.requiresSeparatePackage),
  ).length;

  return {
    rawEstimateCents,
    buyerTotalCents,
    packageCount: groups.length,
    separatePackageCount,
    capCents,
    capReached,
    freeShippingApplied: charge.freeShippingApplied,
    sellerSubsidyCents: charge.sellerSubsidyCents,
    pricingWeightOz: groups.reduce((s, g) => s + g.weightOz, 0),
  };
}

export async function computeSessionPoolTotals(
  sessionId: string,
  db: Db | TransactionClient,
): Promise<BuyerShippingPoolTotals | null> {
  const session = await db.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      liveShow: {
        select: {
          shippingMode: true,
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
          sellerPaysOverCap: true,
          carrierPreference: true,
          bundleEligiblePurchases: true,
          shippingTermsVersion: true,
          defaultShippingProfileId: true,
          defaultSellerShippingProfileId: true,
        },
      },
    },
  });
  if (!session) return null;

  const rows = await profileRowsForSession(sessionId, db);
  const showConfig = liveShowShippingConfigFromRoom(session.liveShow);
  const groups = packageGroupsFromProfileRows(rows, showConfig);
  return computePoolTotalsFromGroups(groups, showConfig);
}

/** Pool delta if buyer wins this queue item (cards vs helmet aware). */
export async function estimateWinItemShippingDeltaCents(args: {
  buyerId: string;
  liveShowId: string;
  liveRoomItemId: string;
  db?: Db;
}): Promise<number | null> {
  const db = args.db ?? prisma;
  const room = await db.liveRoom.findUnique({
    where: { id: args.liveShowId },
    select: {
      id: true,
      sellerId: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
      shippingMode: true,
    },
  });
  if (!room) return null;

  const show = liveShowShippingConfigFromRoom(room);
  if (show.freeShippingEnabled) return 0;

  const shippingMode =
    show.shippingMode ?? (show.freeShippingEnabled ? "free" : show.shippingCapEnabled ? "capped" : "calculated");

  const winProfile = await resolveLiveRoomItemShippingProfile(args.liveRoomItemId, db);
  if (!winProfile) return null;

  const session = await db.liveShippingSession.findUnique({
    where: {
      buyerId_sellerId_liveShowId_destinationAddressId: {
        buyerId: args.buyerId,
        sellerId: room.sellerId,
        liveShowId: args.liveShowId,
        destinationAddressId: LIVE_BUNDLED_SHIPPING_DESTINATION_KEY,
      },
    },
    select: { id: true, shippingChargedCents: true, capReached: true },
  });

  const alreadyChargedCents = Math.max(0, session?.shippingChargedCents ?? 0);
  const capCents =
    show.shippingCapCents != null && Number.isFinite(show.shippingCapCents)
      ? Math.min(Math.max(0, Math.floor(show.shippingCapCents)), PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS)
      : PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS;
  if (
    session?.capReached === true ||
    show.freeShippingEnabled ||
    (capCents > 0 && alreadyChargedCents >= capCents) ||
    alreadyChargedCents >= PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS
  ) {
    return 0;
  }

  const currentRows = session ? await profileRowsForSession(session.id, db) : [];
  const nextRows: ProfileRow[] = [
    ...currentRows,
    { itemId: winProfile.itemId, profile: winProfile.profile, overrides: winProfile.overrides },
  ];
  const nextPool = computePoolTotalsFromGroups(
    packageGroupsFromProfileRows(nextRows, show),
    show,
  );

  return computeBuyerLiveShippingTotals({
    shippingMode,
    shippingCapCents: capCents,
    sellerPaysOverCap: show.sellerPaysOverCap !== false,
    // Pass uncapped raw so remaining-to-cap math matches settlement/subsidy paths.
    estimatedEligibleBundleShippingCents: nextPool.rawEstimateCents,
    shippingAlreadyChargedCents: alreadyChargedCents,
  }).shippingDueForThisPurchaseCents;
}
