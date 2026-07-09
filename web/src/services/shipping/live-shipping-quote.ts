import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isShippoConfigured,
  shippoCreateShipment,
  shippoListRates,
  type ShippoAddress,
  type ShippoParcel,
} from "@/lib/shippo";
import {
  computePoolTotalsFromGroups,
  liveShowShippingConfigFromRoom,
} from "@/services/shipping/live-shipping-pool";
import {
  groupItemsIntoPackages,
  pickShippoRateForPreference,
  resolveShippingProfileDimensions,
  shippoRateAmountCents,
  type LiveShowCarrierPreferenceFilter,
  type PackageGroup,
} from "@/lib/unified-shipping-engine";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import { tierFallbackCentsForPackageGroups } from "@/services/shipping/live-shipping-tier-estimate";

type Db = Pick<
  PrismaClient,
  | "liveShippingSession"
  | "liveShippingSessionItem"
  | "liveRoomItem"
  | "liveRoom"
  | "order"
  | "platformShippingProfile"
  | "shipmentPackage"
>;

function parseEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bundleWeightBufferOz(): number {
  return parseEnvFloat("BUNDLE_WEIGHT_BUFFER_OZ", 1.5);
}

function buildShippoParcel(group: PackageGroup): ShippoParcel {
  const w = Math.max(1, Math.ceil((group.weightOz + bundleWeightBufferOz()) * 10) / 10);
  return {
    length: String(group.lengthIn),
    width: String(group.widthIn),
    height: String(group.heightIn),
    distance_unit: "in",
    weight: String(w),
    mass_unit: "oz",
  };
}

export async function buildSessionPackageGroups(
  sessionId: string,
  db: Db = prisma,
): Promise<{ groups: PackageGroup[]; liveShowId: string } | null> {
  const session = await db.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      liveShowId: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          orderId: true,
          listingId: true,
          appliedWeightOz: true,
        },
      },
      liveShow: {
        select: {
          defaultShippingProfileId: true,
          category: true,
        },
      },
    },
  });
  if (!session) return null;

  const rows: Array<{
    itemId: string;
    profile: Parameters<typeof resolveShippingProfileDimensions>[0];
    overrides?: Parameters<typeof resolveShippingProfileDimensions>[1];
  }> = [];

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
        shippingProfileSnapshotJson: true,
      },
    });

    if (liveItem?.shippingProfile) {
      rows.push({
        itemId: liveItem.id,
        profile: liveItem.shippingProfile,
        overrides: liveItem,
      });
      continue;
    }

    const fallback = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: session.liveShow.defaultShippingProfileId,
      category: session.liveShow.category,
      db,
    });
    if (fallback) {
      rows.push({
        itemId: liveItem?.id ?? si.orderId,
        profile: fallback,
        overrides: liveItem ?? undefined,
      });
      continue;
    }

    rows.push({
      itemId: liveItem?.id ?? si.orderId,
      profile: {
        id: "legacy",
        slug: "trading_cards",
        name: "Trading Cards",
        defaultWeightOz: Math.max(1, si.appliedWeightOz),
        defaultLengthIn: 6,
        defaultWidthIn: 4,
        defaultHeightIn: 1,
        bundleAllowed: true,
        requiresSeparatePackage: false,
      },
    });
  }

  const groups = groupItemsIntoPackages(
    rows.map((r) => ({
      itemId: r.itemId,
      profile: resolveShippingProfileDimensions(r.profile, r.overrides),
    })),
  );

  return { groups, liveShowId: session.liveShowId };
}

export async function quoteShippoCentsForPackageGroups(args: {
  groups: PackageGroup[];
  addressFrom: ShippoAddress;
  addressTo: ShippoAddress;
  carrierPreference?: LiveShowCarrierPreferenceFilter | null;
}): Promise<{ totalCents: number; rateIds: string[] } | { error: "NO_ELIGIBLE_RATES" } | null> {
  if (!isShippoConfigured() || args.groups.length === 0) return null;

  const preference: LiveShowCarrierPreferenceFilter = args.carrierPreference ?? "best_rate";
  let totalCents = 0;
  const rateIds: string[] = [];
  let missingRateGroup = false;

  for (const group of args.groups) {
    const shipment = (await shippoCreateShipment({
      address_from: args.addressFrom,
      address_to: args.addressTo,
      parcels: [buildShippoParcel(group)],
      async: false,
    })) as { object_id?: string };
    const sid = shipment.object_id;
    if (!sid) {
      missingRateGroup = true;
      continue;
    }

    const ratesRes = (await shippoListRates(sid)) as { results?: unknown[] };
    const picked = pickShippoRateForPreference(
      (ratesRes.results ?? []) as Parameters<typeof pickShippoRateForPreference>[0],
      preference,
    );
    if (!picked?.object_id) {
      missingRateGroup = true;
      continue;
    }

    totalCents += shippoRateAmountCents(picked);
    rateIds.push(String(picked.object_id));
  }

  if (missingRateGroup && totalCents <= 0) {
    return { error: "NO_ELIGIBLE_RATES" };
  }
  if (totalCents <= 0) return null;
  return { totalCents, rateIds };
}

/** Recompute buyer charge using Shippo when addresses exist; tier table otherwise. */
export async function refreshLiveShippingSessionShippoEstimate(
  sessionId: string,
  db: Db = prisma,
): Promise<void> {
  const session = await db.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      shippingCostCents: true,
      shippingCapCents: true,
      freeShippingApplied: true,
      liveShowId: true,
      sellerId: true,
      liveShow: {
        select: {
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
          sellerPaysOverCap: true,
          shippingMode: true,
          carrierPreference: true,
        },
      },
      seller: {
        select: {
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
          shipFromName: true,
        },
      },
      orders: {
        where: { paymentStatus: "paid" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          shipRecipientName: true,
          shipAddress: true,
          shipCity: true,
          shipState: true,
          shipZip: true,
          shipCountry: true,
        },
      },
    },
  });
  if (!session) return;

  const built = await buildSessionPackageGroups(sessionId, db);
  if (!built || built.groups.length === 0) return;

  const showConfig = liveShowShippingConfigFromRoom(session.liveShow);

  let rawEstimateCents = tierFallbackCentsForPackageGroups(built.groups, showConfig.shippingCapCents);
  let usedShippo = false;

  const buyer = session.orders[0];
  const from = session.seller;
  if (
    buyer?.shipAddress?.trim() &&
    buyer.shipCity?.trim() &&
    buyer.shipState?.trim() &&
    buyer.shipZip?.trim() &&
    from.shipFromStreet?.trim() &&
    from.shipFromCity?.trim() &&
    from.shipFromState?.trim() &&
    from.shipFromZip?.trim() &&
    from.shipFromCountry?.trim()
  ) {
    const quoted = await quoteShippoCentsForPackageGroups({
      groups: built.groups,
      addressFrom: {
        name: from.shipFromName || "Seller",
        street1: from.shipFromStreet,
        city: from.shipFromCity,
        state: from.shipFromState,
        zip: from.shipFromZip,
        country: from.shipFromCountry,
      },
      addressTo: {
        name: buyer.shipRecipientName || "Buyer",
        street1: buyer.shipAddress,
        city: buyer.shipCity,
        state: buyer.shipState,
        zip: buyer.shipZip,
        country: buyer.shipCountry || "US",
      },
      carrierPreference: session.liveShow.carrierPreference ?? "best_rate",
    });
    if (quoted && "totalCents" in quoted) {
      rawEstimateCents = quoted.totalCents;
      usedShippo = true;
    }
  }

  const totals = computePoolTotalsFromGroups(built.groups, showConfig, rawEstimateCents);

  await db.liveShippingSession.update({
    where: { id: sessionId },
    data: {
      pricingWeightOz: totals.pricingWeightOz,
      shippingCostCents: totals.buyerTotalCents,
      capReached: totals.capReached,
      freeShippingApplied: totals.freeShippingApplied,
      estimatedLabelCostCents: totals.rawEstimateCents,
      sellerShippingSubsidyCents: totals.sellerSubsidyCents,
    },
  });

  if (usedShippo) {
    await syncSessionShipmentPackageEstimates(sessionId, built.groups, db);
  }
}

async function syncSessionShipmentPackageEstimates(
  sessionId: string,
  groups: PackageGroup[],
  db: Db,
): Promise<void> {
  await db.shipmentPackage.deleteMany({
    where: { liveShippingSessionId: sessionId, status: "estimated" },
  });
  for (const group of groups) {
    await db.shipmentPackage.create({
      data: {
        liveShippingSessionId: sessionId,
        packageIndex: group.packageIndex,
        weightOz: group.weightOz,
        lengthIn: group.lengthIn,
        widthIn: group.widthIn,
        heightIn: group.heightIn,
        status: "estimated",
      },
    });
  }
}
