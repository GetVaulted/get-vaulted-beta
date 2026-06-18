import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeShowShippingLiability,
  groupItemsIntoPackages,
  resolveShippingProfileDimensions,
  shipmentProfileEditLocked,
  type LiveShowShippingConfig,
} from "@/lib/unified-shipping-engine";
import { getActivePlatformShippingProfiles } from "@/services/shipping/platform-shipping-profiles";

type Db = Pick<
  PrismaClient,
  | "liveRoom"
  | "liveRoomItem"
  | "liveShippingSession"
  | "shipmentPackage"
  | "platformShippingProfile"
  | "order"
>;

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

export async function getLiveShowShippingDashboard(liveRoomId: string, db: Db = prisma) {
  const room = await db.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      defaultShippingProfileId: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
      defaultShippingProfile: true,
    },
  });
  if (!room) return null;

  const [profiles, items, sessions] = await Promise.all([
    getActivePlatformShippingProfiles(db),
    db.liveRoomItem.findMany({
      where: { liveRoomId, status: { notIn: ["skipped"] } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        shippingProfileId: true,
        customWeightOz: true,
        customLengthIn: true,
        customWidthIn: true,
        customHeightIn: true,
        requiresSeparatePackage: true,
        shippingProfile: true,
        listing: {
          select: {
            orders: {
              select: {
                id: true,
                shippoTransactionId: true,
                labelUrl: true,
                paymentStatus: true,
              },
              take: 1,
            },
          },
        },
      },
    }),
    db.liveShippingSession.findMany({
      where: { liveShowId: liveRoomId },
      select: {
        id: true,
        buyerId: true,
        shippingCostCents: true,
        estimatedLabelCostCents: true,
        sellerShippingSubsidyCents: true,
      },
    }),
  ]);

  const showConfig = liveShowShippingConfigFromRoom(room);
  const liability = computeShowShippingLiability({ show: showConfig, sessions });

  const lineup = items.map((item) => {
    const profile = item.shippingProfile;
    const resolved = profile
      ? resolveShippingProfileDimensions(profile, item)
      : null;
    const order = item.listing?.orders?.[0];
    const labelLocked = Boolean(order?.shippoTransactionId?.trim() || order?.labelUrl?.trim());
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      shippingProfileId: item.shippingProfileId,
      profileName: profile?.name ?? null,
      resolved,
      labelLocked,
      canEditProfile: !labelLocked && item.status !== "sold",
    };
  });

  return {
    room: {
      id: room.id,
      title: room.title,
      status: room.status,
      defaultShippingProfileId: room.defaultShippingProfileId,
      shippingCapEnabled: room.shippingCapEnabled,
      shippingCapCents: room.shippingCapCents,
      freeShippingEnabled: room.freeShippingEnabled,
      sellerPaysOverCap: room.sellerPaysOverCap,
    },
    profiles,
    lineup,
    liability,
    capWarningMessage: liability.capWarning
      ? "Shipping cap may cause seller subsidy."
      : null,
  };
}

export async function updateLiveShowShippingSettings(
  liveRoomId: string,
  patch: {
    defaultShippingProfileId?: string | null;
    shippingCapEnabled?: boolean;
    shippingCapCents?: number | null;
    freeShippingEnabled?: boolean;
    sellerPaysOverCap?: boolean;
  },
  db: Db = prisma,
) {
  const data: Record<string, unknown> = {};
  if (patch.defaultShippingProfileId !== undefined) {
    data.defaultShippingProfileId = patch.defaultShippingProfileId?.trim() || null;
  }
  if (typeof patch.shippingCapEnabled === "boolean") data.shippingCapEnabled = patch.shippingCapEnabled;
  if (patch.shippingCapCents !== undefined) {
    data.shippingCapCents =
      patch.shippingCapCents != null && Number.isFinite(patch.shippingCapCents)
        ? Math.max(0, Math.floor(patch.shippingCapCents))
        : null;
  }
  if (typeof patch.freeShippingEnabled === "boolean") data.freeShippingEnabled = patch.freeShippingEnabled;
  if (typeof patch.sellerPaysOverCap === "boolean") data.sellerPaysOverCap = patch.sellerPaysOverCap;

  return db.liveRoom.update({
    where: { id: liveRoomId },
    data,
  });
}

export async function updateLiveRoomItemShippingProfile(
  liveRoomId: string,
  itemId: string,
  patch: {
    shippingProfileId?: string | null;
    customWeightOz?: number | null;
    customLengthIn?: number | null;
    customWidthIn?: number | null;
    customHeightIn?: number | null;
    requiresSeparatePackage?: boolean | null;
  },
  db: Db = prisma,
) {
  const item = await db.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: {
      id: true,
      status: true,
      listing: {
        select: {
          orders: {
            select: { shippoTransactionId: true, labelUrl: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!item) return { ok: false as const, error: "Item not found.", status: 404 };

  const order = item.listing?.orders?.[0];
  if (order?.shippoTransactionId?.trim() || order?.labelUrl?.trim()) {
    return { ok: false as const, error: "Cannot change shipping after a label was created.", status: 409 };
  }

  const packages = await db.shipmentPackage.findMany({
    where: { order: { listing: { liveRoomItems: { some: { id: itemId } } } } },
    select: { shippoTransactionId: true, labelUrl: true, status: true },
  });
  if (shipmentProfileEditLocked(packages)) {
    return { ok: false as const, error: "Cannot change shipping after a label was created.", status: 409 };
  }

  const data: Record<string, unknown> = {};
  if (patch.shippingProfileId !== undefined) {
    data.shippingProfileId = patch.shippingProfileId?.trim() || null;
  }
  if (patch.customWeightOz !== undefined) data.customWeightOz = patch.customWeightOz;
  if (patch.customLengthIn !== undefined) data.customLengthIn = patch.customLengthIn;
  if (patch.customWidthIn !== undefined) data.customWidthIn = patch.customWidthIn;
  if (patch.customHeightIn !== undefined) data.customHeightIn = patch.customHeightIn;
  if (patch.requiresSeparatePackage !== undefined) {
    data.requiresSeparatePackage = patch.requiresSeparatePackage;
  }

  const updated = await db.liveRoomItem.update({ where: { id: itemId }, data });
  return { ok: true as const, item: updated };
}

export async function bulkUpdateUnsoldItemProfiles(
  liveRoomId: string,
  fromProfileId: string,
  toProfileId: string,
  db: Db = prisma,
) {
  const result = await db.liveRoomItem.updateMany({
    where: {
      liveRoomId,
      status: { in: ["queued", "active"] },
      shippingProfileId: fromProfileId,
    },
    data: { shippingProfileId: toProfileId },
  });
  return result.count;
}

/** Estimate package groups for a buyer session based on won item profiles. */
export function estimateSessionPackageGroups(
  rows: Array<{
    itemId: string;
    profile: Parameters<typeof resolveShippingProfileDimensions>[0];
    overrides?: Parameters<typeof resolveShippingProfileDimensions>[1];
    quantity?: number;
  }>,
) {
  return groupItemsIntoPackages(
    rows.map((r) => ({
      itemId: r.itemId,
      profile: resolveShippingProfileDimensions(r.profile, r.overrides),
      quantity: r.quantity,
    })),
  );
}
