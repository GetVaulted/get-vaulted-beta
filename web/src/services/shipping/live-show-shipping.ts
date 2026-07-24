import type { PrismaClient } from "@/generated/prisma/client";
import type { LiveShowCarrierPreference, LiveShowShippingMode } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  computeShowShippingLiability,
  groupItemsIntoPackages,
  resolveShippingProfileDimensions,
  shipmentProfileEditLocked,
} from "@/lib/unified-shipping-engine";
import { liveRoomShippingPatchFromMode, resolveLiveShowShippingCapCents, shippingModeFromRoomFlags } from "@/lib/live-show-shipping-terms";
import { liveShowShippingConfigFromRoom } from "@/services/shipping/live-shipping-pool";
import { getActivePlatformShippingProfiles } from "@/services/shipping/platform-shipping-profiles";
import { getActiveSellerShippingProfiles, sellerProfileToProfileInput } from "@/services/shipping/seller-shipping-profiles";

type Db = Pick<
  PrismaClient,
  | "liveRoom"
  | "liveRoomItem"
  | "liveShippingSession"
  | "shipmentPackage"
  | "platformShippingProfile"
  | "sellerShippingProfile"
  | "order"
>;

export { liveShowShippingConfigFromRoom };

export async function getLiveShowShippingDashboard(liveRoomId: string, db: Db = prisma) {
  const room = await db.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      sellerId: true,
      defaultShippingProfileId: true,
      defaultSellerShippingProfileId: true,
      shippingMode: true,
      carrierPreference: true,
      bundleEligiblePurchases: true,
      shippingTermsVersion: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
      defaultShippingProfile: true,
    },
  });
  if (!room) return null;

  const [platformProfiles, sellerProfiles, items, sessions] = await Promise.all([
    getActivePlatformShippingProfiles(db),
    getActiveSellerShippingProfiles(room.sellerId, db),
    db.liveRoomItem.findMany({
      where: { liveRoomId, status: { notIn: ["skipped"] } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        shippingProfileId: true,
        sellerShippingProfileId: true,
        customWeightOz: true,
        customLengthIn: true,
        customWidthIn: true,
        customHeightIn: true,
        requiresSeparatePackage: true,
        shippingProfile: true,
        sellerShippingProfile: true,
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
    const profileInput = item.sellerShippingProfile
      ? sellerProfileToProfileInput(item.sellerShippingProfile)
      : item.shippingProfile;
    const resolved = profileInput ? resolveShippingProfileDimensions(profileInput, item) : null;
    const profileName = item.sellerShippingProfile?.name ?? item.shippingProfile?.name ?? null;
    const order = item.listing?.orders?.[0];
    const labelLocked = Boolean(order?.shippoTransactionId?.trim() || order?.labelUrl?.trim());
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      shippingProfileId: item.shippingProfileId,
      sellerShippingProfileId: item.sellerShippingProfileId,
      profileName,
      resolved,
      labelLocked,
      canEditProfile: !labelLocked && item.status !== "sold",
    };
  });

  return {
    room: {
      id: room.id,
      title: room.title,
      category: room.category,
      status: room.status,
      shippingMode: shippingModeFromRoomFlags(room),
      defaultShippingProfileId: room.defaultShippingProfileId,
      defaultSellerShippingProfileId: room.defaultSellerShippingProfileId,
      carrierPreference: room.carrierPreference,
      bundleEligiblePurchases: room.bundleEligiblePurchases,
      shippingTermsVersion: room.shippingTermsVersion,
      shippingCapEnabled: room.shippingCapEnabled,
      shippingCapCents: room.shippingCapCents,
      freeShippingEnabled: room.freeShippingEnabled,
      sellerPaysOverCap: room.sellerPaysOverCap,
    },
    profiles: platformProfiles,
    sellerProfiles,
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
    shippingMode?: LiveShowShippingMode;
    defaultShippingProfileId?: string | null;
    defaultSellerShippingProfileId?: string | null;
    shippingCapEnabled?: boolean;
    shippingCapCents?: number | null;
    freeShippingEnabled?: boolean;
    sellerPaysOverCap?: boolean;
    carrierPreference?: LiveShowCarrierPreference;
    bundleEligiblePurchases?: boolean;
    bumpTermsVersion?: boolean;
  },
  db: Db = prisma,
) {
  const existing = await db.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { shippingTermsVersion: true, shippingMode: true, shippingCapCents: true },
  });
  if (!existing) throw new Error("ROOM_NOT_FOUND");

  const data: Record<string, unknown> = {};
  if (patch.shippingMode) {
    Object.assign(data, liveRoomShippingPatchFromMode({
      shippingMode: patch.shippingMode,
      shippingCapCents: patch.shippingCapCents ?? existing.shippingCapCents,
    }));
  }
  if (patch.defaultShippingProfileId !== undefined) {
    data.defaultShippingProfileId = patch.defaultShippingProfileId?.trim() || null;
  }
  if (patch.defaultSellerShippingProfileId !== undefined) {
    data.defaultSellerShippingProfileId = patch.defaultSellerShippingProfileId?.trim() || null;
  }
  if (typeof patch.shippingCapEnabled === "boolean" && !patch.shippingMode) {
    data.shippingCapEnabled = patch.shippingCapEnabled;
  }
  if (patch.shippingCapCents !== undefined && !patch.shippingMode) {
    data.shippingCapCents =
      patch.shippingCapCents != null && Number.isFinite(patch.shippingCapCents)
        ? resolveLiveShowShippingCapCents(patch.shippingCapCents)
        : null;
  }
  if (typeof patch.freeShippingEnabled === "boolean" && !patch.shippingMode) {
    data.freeShippingEnabled = patch.freeShippingEnabled;
  }
  if (typeof patch.sellerPaysOverCap === "boolean") data.sellerPaysOverCap = patch.sellerPaysOverCap;
  if (patch.carrierPreference) data.carrierPreference = patch.carrierPreference;
  if (typeof patch.bundleEligiblePurchases === "boolean") {
    data.bundleEligiblePurchases = patch.bundleEligiblePurchases;
  }
  if (patch.bumpTermsVersion) {
    data.shippingTermsVersion = (existing.shippingTermsVersion ?? 1) + 1;
  }

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
    sellerShippingProfileId?: string | null;
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
  if (patch.sellerShippingProfileId !== undefined) {
    data.sellerShippingProfileId = patch.sellerShippingProfileId?.trim() || null;
  }
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
