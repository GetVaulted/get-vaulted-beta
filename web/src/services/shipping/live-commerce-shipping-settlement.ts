import type { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  computeBuyerLiveShippingTotals,
  resolveShippingProfileDimensions,
  serializeProfileSnapshot,
} from "@/lib/unified-shipping-engine";
import {
  liveShowShippingTermsFromRoom,
  liveShowShippingConfigFromTerms,
  type LiveShowShippingTerms,
} from "@/lib/live-show-shipping-terms";
import type { AddOrderToLiveShippingSessionOpts } from "@/services/shipping/live-shipping-pricing";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import {
  resolveBreakSpotSellerProfile,
  resolveSellerProfileForLiveRoomItem,
  sellerShippingProfileToProfileInput,
} from "@/services/shipping/seller-shipping-profiles";

export type LiveOrderShippingTermsSnapshot = {
  liveShowId: string;
  sellerId: string;
  buyerId: string;
  shippingMode: LiveShowShippingTerms["shippingMode"];
  shippingCapCents: number | null;
  carrierPreference: LiveShowShippingTerms["carrierPreference"];
  bundleEligiblePurchases: boolean;
  selectedShippingProfileId: string | null;
  shippingProfileSnapshot: Record<string, unknown> | null;
  estimatedShippingBeforePurchaseCents: number;
  shippingChargedThisPurchaseCents: number;
  totalShippingChargedSoFarCents: number;
  shippingTermsVersion: number;
  capturedAt: string;
  idempotencyKey: string;
};

export type LiveOrderShippingSettlementResult = {
  sessionId: string;
  shippingCostCents: number;
  shippingDueCents: number;
  shippingPriceUsd: number;
  capReached: boolean;
  snapshot: LiveOrderShippingTermsSnapshot;
};

/** Row-lock the live shipping session so concurrent purchases serialize cap math. */
export async function lockLiveShippingSessionForUpdateTx(
  tx: TransactionClient,
  sessionId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM "LiveShippingSession" WHERE id = ${sessionId} FOR UPDATE`;
}

/** Sum shipping reserved on sibling orders in the same bundled session (pending or paid). */
export async function sumSessionReservedShippingCentsTx(
  tx: TransactionClient,
  sessionId: string,
  excludeOrderId?: string | null,
): Promise<number> {
  const orders = await tx.order.findMany({
    where: {
      liveShippingSessionId: sessionId,
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { shippingPriceUsd: true, shippingChargedCents: true },
  });
  return orders.reduce((sum, o) => {
    if (o.shippingChargedCents != null && Number.isFinite(o.shippingChargedCents)) {
      return sum + Math.max(0, Math.floor(o.shippingChargedCents));
    }
    return sum + Math.round(Math.max(0, o.shippingPriceUsd) * 100);
  }, 0);
}

async function resolveShippingProfileForOrderTx(
  tx: TransactionClient,
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<{ profileId: string | null; profileSnapshot: Record<string, unknown> | null }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { sellerId: true, listingId: true },
  });
  if (!order) return { profileId: null, profileSnapshot: null };

  const liveItem =
    opts?.liveShowId && opts?.liveRoomItemId
      ? await tx.liveRoomItem.findFirst({
          where: {
            id: opts.liveRoomItemId,
            liveRoomId: opts.liveShowId,
            liveRoom: { sellerId: order.sellerId },
          },
          select: {
            sellerShippingProfileId: true,
            shippingProfileId: true,
            customWeightOz: true,
            customLengthIn: true,
            customWidthIn: true,
            customHeightIn: true,
            requiresSeparatePackage: true,
            shippingProfile: true,
            shippingProfileSnapshotJson: true,
            liveRoom: {
              select: {
                defaultSellerShippingProfileId: true,
                defaultShippingProfileId: true,
                category: true,
                roomType: true,
              },
            },
          },
        })
      : opts?.liveShowId
        ? await tx.liveRoomItem.findFirst({
            where: { listingId: order.listingId, liveRoomId: opts.liveShowId },
            select: {
              sellerShippingProfileId: true,
              shippingProfileId: true,
              customWeightOz: true,
              customLengthIn: true,
              customWidthIn: true,
              customHeightIn: true,
              requiresSeparatePackage: true,
              shippingProfile: true,
              shippingProfileSnapshotJson: true,
              liveRoom: {
                select: {
                  defaultSellerShippingProfileId: true,
                  defaultShippingProfileId: true,
                  category: true,
                  roomType: true,
                },
              },
            },
          })
        : await tx.liveRoomItem.findFirst({
            where: { listingId: order.listingId, liveRoom: { sellerId: order.sellerId } },
            orderBy: { updatedAt: "desc" },
            select: {
              sellerShippingProfileId: true,
              shippingProfileId: true,
              customWeightOz: true,
              customLengthIn: true,
              customWidthIn: true,
              customHeightIn: true,
              requiresSeparatePackage: true,
              shippingProfile: true,
              shippingProfileSnapshotJson: true,
              liveRoom: {
                select: {
                  defaultSellerShippingProfileId: true,
                  defaultShippingProfileId: true,
                  category: true,
                  roomType: true,
                },
              },
            },
          });

  const show =
    liveItem?.liveRoom ??
    (opts?.liveShowId
      ? await tx.liveRoom.findFirst({
          where: { id: opts.liveShowId, sellerId: order.sellerId },
          select: {
            defaultSellerShippingProfileId: true,
            defaultShippingProfileId: true,
            category: true,
            roomType: true,
          },
        })
      : null);

  const isBreakCommerce =
    liveItem?.liveRoom.roomType === "break" ||
    show?.roomType === "break" ||
    Boolean(opts?.liveRoomItemId);

  let sellerProfile = isBreakCommerce
    ? await resolveBreakSpotSellerProfile({
        sellerId: order.sellerId,
        showDefaultSellerProfileId: show?.defaultSellerShippingProfileId ?? null,
        itemSellerProfileId: liveItem?.sellerShippingProfileId ?? null,
        db: tx,
      })
    : await resolveSellerProfileForLiveRoomItem({
        sellerId: order.sellerId,
        sellerShippingProfileId: liveItem?.sellerShippingProfileId ?? null,
        showDefaultSellerProfileId: show?.defaultSellerShippingProfileId ?? null,
        db: tx,
      });

  let platformProfile = liveItem?.shippingProfile;
  if (!platformProfile && show) {
    platformProfile = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: show.defaultShippingProfileId,
      category: show.category,
      db: tx,
    });
  }

  const profileForDims = sellerProfile
    ? sellerShippingProfileToProfileInput(sellerProfile)
    : platformProfile;
  if (!profileForDims) {
    return { profileId: null, profileSnapshot: null };
  }

  if (liveItem?.shippingProfileSnapshotJson?.trim()) {
    try {
      return {
        profileId: sellerProfile?.id ?? liveItem.shippingProfileId ?? null,
        profileSnapshot: JSON.parse(liveItem.shippingProfileSnapshotJson) as Record<string, unknown>,
      };
    } catch {
      /* fall through */
    }
  }

  const resolved = resolveShippingProfileDimensions(profileForDims, liveItem ?? undefined);
  return {
    profileId: sellerProfile?.id ?? liveItem?.shippingProfileId ?? null,
    profileSnapshot: JSON.parse(serializeProfileSnapshot(resolved)) as Record<string, unknown>,
  };
}

function snapshotFromOrderRow(
  order: {
    id: string;
    buyerId: string;
    sellerId: string;
    shippingPriceUsd: number;
    shippingTermsSnapshotJson: Prisma.JsonValue;
  },
  sessionId: string,
): LiveOrderShippingSettlementResult | null {
  if (order.shippingTermsSnapshotJson == null || typeof order.shippingTermsSnapshotJson !== "object") {
    return null;
  }
  const snap = order.shippingTermsSnapshotJson as LiveOrderShippingTermsSnapshot;
  return {
    sessionId,
    shippingCostCents: snap.totalShippingChargedSoFarCents,
    shippingDueCents: snap.shippingChargedThisPurchaseCents,
    shippingPriceUsd: order.shippingPriceUsd,
    capReached: snap.totalShippingChargedSoFarCents >= (snap.shippingCapCents ?? Number.MAX_SAFE_INTEGER),
    snapshot: snap,
  };
}

/**
 * Atomically reserve incremental live shipping for an order and persist an immutable terms snapshot.
 * Idempotent per order — safe to retry after partial failure.
 */
export async function settleLiveOrderShippingTx(
  tx: TransactionClient,
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<LiveOrderShippingSettlementResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      itemPriceUsd: true,
      taxUsd: true,
      liveShippingSessionId: true,
      shippingTermsSnapshotJson: true,
      shippingPriceUsd: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!order.liveShippingSessionId) throw new Error("LIVE_SHIPPING_SESSION_NOT_LINKED");

  const existing = snapshotFromOrderRow(order, order.liveShippingSessionId);
  if (existing) return existing;

  await lockLiveShippingSessionForUpdateTx(tx, order.liveShippingSessionId);

  const session = await tx.liveShippingSession.findUnique({
    where: { id: order.liveShippingSessionId },
    select: {
      id: true,
      shippingCostCents: true,
      liveShowId: true,
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
  if (!session) throw new Error("LIVE_SHIPPING_SESSION_NOT_FOUND");

  const showTerms = liveShowShippingTermsFromRoom(session.liveShow);
  const showConfig = liveShowShippingConfigFromTerms(showTerms);
  const alreadyReservedCents = await sumSessionReservedShippingCentsTx(tx, session.id, orderId);

  const totals = computeBuyerLiveShippingTotals({
    shippingMode: showConfig.shippingMode ?? "calculated",
    shippingCapCents: showConfig.shippingCapCents,
    sellerPaysOverCap: showConfig.sellerPaysOverCap !== false,
    estimatedEligibleBundleShippingCents: session.shippingCostCents,
    shippingAlreadyChargedCents: alreadyReservedCents,
  });

  const shippingDueCents = totals.shippingDueForThisPurchaseCents;
  const totalChargedSoFarCents = alreadyReservedCents + shippingDueCents;
  const shippingPriceUsd = shippingDueCents / 100;
  const estimatedBeforeCents = Math.max(0, session.shippingCostCents - shippingDueCents);

  const profileInfo = await resolveShippingProfileForOrderTx(tx, orderId, opts);
  const capturedAt = new Date().toISOString();

  const snapshot: LiveOrderShippingTermsSnapshot = {
    liveShowId: session.liveShowId,
    sellerId: order.sellerId,
    buyerId: order.buyerId,
    shippingMode: showTerms.shippingMode,
    shippingCapCents: showTerms.shippingCapCents,
    carrierPreference: showTerms.carrierPreference,
    bundleEligiblePurchases: showTerms.bundleEligiblePurchases,
    selectedShippingProfileId: profileInfo.profileId,
    shippingProfileSnapshot: profileInfo.profileSnapshot,
    estimatedShippingBeforePurchaseCents: estimatedBeforeCents,
    shippingChargedThisPurchaseCents: shippingDueCents,
    totalShippingChargedSoFarCents: totalChargedSoFarCents,
    shippingTermsVersion: showTerms.shippingTermsVersion,
    capturedAt,
    idempotencyKey: orderId,
  };

  await tx.order.update({
    where: { id: orderId },
    data: {
      shippingPriceUsd,
      totalUsd: order.itemPriceUsd + shippingPriceUsd + order.taxUsd,
      shippingCapApplied: totals.capReached,
      freeShippingApplied: totals.freeShippingApplied,
      sellerShippingSubsidyCents: totals.sellerShippingSubsidyCents,
      shippingTermsVersion: showTerms.shippingTermsVersion,
      shippingTermsSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  await tx.liveShippingSession.update({
    where: { id: session.id },
    data: {
      shippingChargedCents: totalChargedSoFarCents,
      capReached: totals.capReached,
    },
  });

  return {
    sessionId: session.id,
    shippingCostCents: session.shippingCostCents,
    shippingDueCents,
    shippingPriceUsd,
    capReached: totals.capReached,
    snapshot,
  };
}

/** Re-sync order shipping from session (used before payment capture). Delegates to atomic settlement. */
export async function syncOrderShippingFromLiveSessionTx(tx: TransactionClient, orderId: string) {
  const ord = await tx.order.findUnique({
    where: { id: orderId },
    select: { liveShippingSessionId: true, shippingTermsSnapshotJson: true },
  });
  if (!ord?.liveShippingSessionId) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  if (ord.shippingTermsSnapshotJson != null) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  await settleLiveOrderShippingTx(tx, orderId);
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}
