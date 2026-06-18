import type { PrismaClient } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import {
  computeLiveBuyerShippingCharge,
  groupItemsIntoPackages,
  resolveShippingProfileDimensions,
  type LiveShowShippingConfig,
  type PackageGroup,
} from "@/lib/unified-shipping-engine";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import { tierFallbackCentsForPackageGroups } from "@/services/shipping/live-shipping-tier-estimate";

type Db = Pick<
  PrismaClient,
  "liveRoom" | "liveRoomItem" | "liveShippingSession" | "liveShippingSessionItem" | "platformShippingProfile"
>;

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
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
}): LiveShowShippingConfig {
  return {
    shippingCapEnabled: room.shippingCapEnabled,
    shippingCapCents: room.shippingCapCents,
    freeShippingEnabled: room.freeShippingEnabled,
    sellerPaysOverCap: room.sellerPaysOverCap,
  };
}

type ProfileRow = {
  itemId: string;
  profile: Parameters<typeof resolveShippingProfileDimensions>[0];
  overrides?: Parameters<typeof resolveShippingProfileDimensions>[1];
};

export async function resolveLiveRoomItemShippingProfile(
  liveRoomItemId: string,
  db: Db | TransactionClient = prisma,
) {
  const item = await db.liveRoomItem.findUnique({
    where: { id: liveRoomItemId },
    select: {
      id: true,
      shippingProfileId: true,
      customWeightOz: true,
      customLengthIn: true,
      customWidthIn: true,
      customHeightIn: true,
      requiresSeparatePackage: true,
      shippingProfile: true,
      liveRoom: { select: { defaultShippingProfileId: true, category: true } },
    },
  });
  if (!item) return null;

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
      items: { orderBy: { createdAt: "asc" }, select: { orderId: true, listingId: true } },
      liveShow: { select: { defaultShippingProfileId: true, category: true } },
    },
  });
  if (!session) return [];

  const rows: ProfileRow[] = [];
  for (const si of session.items) {
    const liveItem = await db.liveRoomItem.findFirst({
      where: { liveRoomId: session.liveShowId, listingId: si.listingId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        shippingProfileId: true,
        customWeightOz: true,
        customLengthIn: true,
        customWidthIn: true,
        customHeightIn: true,
        requiresSeparatePackage: true,
        shippingProfile: true,
      },
    });
    if (liveItem?.shippingProfile) {
      rows.push({ itemId: liveItem.id, profile: liveItem.shippingProfile, overrides: liveItem });
      continue;
    }
    const fallback = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: session.liveShow.defaultShippingProfileId,
      category: session.liveShow.category,
      db: db as Db,
    });
    if (fallback) {
      rows.push({
        itemId: liveItem?.id ?? si.orderId,
        profile: fallback,
        overrides: liveItem ?? undefined,
      });
    }
  }
  return rows;
}

export function packageGroupsFromProfileRows(rows: ProfileRow[]): PackageGroup[] {
  return groupItemsIntoPackages(
    rows.map((r) => ({
      itemId: r.itemId,
      profile: resolveShippingProfileDimensions(r.profile, r.overrides),
    })),
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
      : tierFallbackCentsForPackageGroups(
          groups,
          show.shippingCapEnabled ? show.shippingCapCents : null,
        );
  const charge = computeLiveBuyerShippingCharge({
    rawShippoEstimateCents: rawEstimateCents,
    show,
    alreadyChargedCents: 0,
  });

  const buyerTotalCents = charge.freeShippingApplied
    ? 0
    : show.shippingCapEnabled && show.shippingCapCents != null
      ? Math.min(rawEstimateCents, show.shippingCapCents)
      : rawEstimateCents;

  const capCents = show.shippingCapEnabled ? show.shippingCapCents : null;
  const capReached =
    !charge.freeShippingApplied &&
    show.shippingCapEnabled &&
    capCents != null &&
    buyerTotalCents >= capCents;

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
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
          sellerPaysOverCap: true,
        },
      },
    },
  });
  if (!session) return null;

  const rows = await profileRowsForSession(sessionId, db);
  const groups = packageGroupsFromProfileRows(rows);
  return computePoolTotalsFromGroups(groups, liveShowShippingConfigFromRoom(session.liveShow));
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
      sellerId: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
    },
  });
  if (!room) return null;

  const show = liveShowShippingConfigFromRoom(room);
  if (show.freeShippingEnabled) return 0;

  const winProfile = await resolveLiveRoomItemShippingProfile(args.liveRoomItemId, db);
  if (!winProfile) return null;

  const session = await db.liveShippingSession.findFirst({
    where: { buyerId: args.buyerId, liveShowId: args.liveShowId, sellerId: room.sellerId },
    select: { id: true },
  });

  const currentRows = session ? await profileRowsForSession(session.id, db) : [];
  const currentTotal = computePoolTotalsFromGroups(packageGroupsFromProfileRows(currentRows), show).buyerTotalCents;

  const nextRows: ProfileRow[] = [
    ...currentRows,
    { itemId: winProfile.itemId, profile: winProfile.profile, overrides: winProfile.overrides },
  ];
  const nextTotal = computePoolTotalsFromGroups(packageGroupsFromProfileRows(nextRows), show).buyerTotalCents;

  return Math.max(0, nextTotal - currentTotal);
}
