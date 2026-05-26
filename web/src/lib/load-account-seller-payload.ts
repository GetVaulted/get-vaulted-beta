import type { Prisma } from "@/generated/prisma/client";
import { sellerPrimaryNextAction } from "@/lib/seller-fulfillment-next-action";
import { serializePrismaClientError } from "@/lib/prisma-client-error-serialize";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import type { LiveShowReadiness } from "@/lib/live-show-readiness-types";

const EMPTY_READINESS: LiveShowReadiness = {
  canGoLive: false,
  issues: [],
  checks: {
    hasStripeAccount: false,
    stripeChargesEnabled: false,
    hasShippoConfigured: false,
    hasShipFromAddress: false,
    alternateCheckoutSellerReady: false,
    hasAtLeastOneListingWithShippingProfile: false,
  },
};

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<{ value: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (e) {
    const pe = serializePrismaClientError(e);
    console.error(`[loadAccountSellerPayload] ${label}`, pe);
    return { value: fallback, error: `${label}: ${pe.code ?? pe.name} ${pe.message}` };
  }
}

export type AccountSellerPayload = {
  setupWizardComplete: boolean;
  sellerSetupWizardCompletedAt: string | null;
  seller: {
    username: string;
    stripeAccountId: string | null;
    stripeOnboardingComplete: boolean;
    name: string | null;
    image: string | null;
    shipFromName: string | null;
    shipFromStreet: string | null;
    shipFromCity: string | null;
    shipFromState: string | null;
    shipFromZip: string | null;
    shipFromCountry: string | null;
    defaultShipFromAddressId: string | null;
  };
  stripePlatformConfigured: boolean;
  stripeEmbedOnboardingAvailable: boolean;
  fulfillmentNextAction: string;
  auctionRecoveryListingId: string | null;
  auctionRecoveryListingTitle: string | null;
  auctionEndedUnpaidCount: number;
  paidOrdersNeedingLabelCount: number;
  paidOrderNeedingLabelId: string | null;
  readiness: LiveShowReadiness;
  shipFromAddresses: Prisma.AddressGetPayload<object>[];
  recommendedCategories: { category: string; count: number }[];
  sellerHomeStats: {
    activeListingsCount: number;
    draftListingsCount: number;
    openOrdersCount: number;
    awaitingShipmentCount: number;
    recentSalesCount: number;
    unreadBuyerMessagesCount: number;
    liveRoom: {
      id: string;
      title: string;
      status: string;
      scheduledStartAt: string | null;
    } | null;
  };
  commerceEvents: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    listingId: string | null;
    orderId: string | null;
    createdAt: string;
  }>;
  partialErrors?: string[];
  provisioned?: boolean;
};

export async function loadAccountSellerPayload(userId: string, opts?: { provisioned?: boolean }): Promise<AccountSellerPayload> {
  const partialErrors: string[] = [];

  const userResult = await safe(
    "user",
    () =>
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          username: true,
          stripeAccountId: true,
          stripeOnboardingComplete: true,
          name: true,
          image: true,
          shipFromName: true,
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
          sellerSetupWizardCompletedAt: true,
          defaultShipFromAddressId: true,
        },
      }),
    null,
  );
  if (!userResult.value) {
    throw new Error(userResult.error ?? "User not found");
  }
  if (userResult.error) partialErrors.push(userResult.error);
  const user = userResult.value;

  const recentSalesResult = await safe(
    "recentSales",
    () =>
      prisma.order.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          shippoTransactionId: true,
          labelUrl: true,
          trackingNumber: true,
          trackingUrl: true,
        },
      }),
    [],
  );
  if (recentSalesResult.error) partialErrors.push(recentSalesResult.error);
  const recentSales = recentSalesResult.value;

  const fulfillmentNextAction = sellerPrimaryNextAction(user, recentSales).label;

  const [
    auctionEndedUnpaidCountR,
    auctionRecoveryListingR,
    commerceEventsR,
    paidOrdersNeedingLabelCountR,
    paidOrderNeedingLabelR,
    readinessR,
    shipFromAddressesR,
    activeListingsCountR,
    draftListingsCountR,
    openOrdersCountR,
    awaitingShipmentCountR,
    recentSalesCountR,
    unreadBuyerMessagesCountR,
    liveRoomR,
    sellerListingCategoryRowsR,
  ] = await Promise.all([
    safe("auctionEndedUnpaidCount", () => prisma.listing.count({ where: { sellerId: userId, status: "auction_ended_unpaid" } }), 0),
    safe(
      "auctionRecoveryListing",
      () =>
        prisma.listing.findFirst({
          where: { sellerId: userId, status: "auction_ended_unpaid" },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true },
        }),
      null,
    ),
    safe(
      "commerceEvents",
      () =>
        prisma.sellerCommerceEvent.findMany({
          where: { sellerId: userId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            kind: true,
            title: true,
            body: true,
            listingId: true,
            orderId: true,
            createdAt: true,
          },
        }),
      [],
    ),
    safe(
      "paidOrdersNeedingLabelCount",
      () =>
        prisma.order.count({
          where: {
            sellerId: userId,
            paymentStatus: "paid",
            shippoTransactionId: null,
            labelUrl: null,
            status: { not: "cancelled" },
          },
        }),
      0,
    ),
    safe(
      "paidOrderNeedingLabel",
      () =>
        prisma.order.findFirst({
          where: {
            sellerId: userId,
            paymentStatus: "paid",
            shippoTransactionId: null,
            labelUrl: null,
            status: { not: "cancelled" },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        }),
      null,
    ),
    safe("readiness", () => getSellerLiveReadiness(userId, prisma), EMPTY_READINESS),
    safe(
      "shipFromAddresses",
      () =>
        prisma.address.findMany({
          where: { userId, type: "ship_from" },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
      [],
    ),
    safe(
      "activeListingsCount",
      () =>
        prisma.listing.count({
          where: { sellerId: userId, status: { in: ["active", "auction_live"] }, moderationRemovedAt: null },
        }),
      0,
    ),
    safe(
      "draftListingsCount",
      () =>
        prisma.listing.count({
          where: { sellerId: userId, status: "draft", moderationRemovedAt: null },
        }),
      0,
    ),
    safe(
      "openOrdersCount",
      () =>
        prisma.order.count({
          where: { sellerId: userId, status: { notIn: ["delivered", "cancelled"] } },
        }),
      0,
    ),
    safe(
      "awaitingShipmentCount",
      () =>
        prisma.order.count({
          where: {
            sellerId: userId,
            paymentStatus: "paid",
            fulfillmentStatus: { in: ["pending", "processing"] },
            status: { not: "cancelled" },
          },
        }),
      0,
    ),
    safe(
      "recentSalesCount",
      () =>
        prisma.order.count({
          where: { sellerId: userId, paymentStatus: "paid" },
        }),
      0,
    ),
    safe(
      "unreadBuyerMessagesCount",
      () =>
        prisma.message.count({
          where: { recipientId: userId, readAt: null },
        }),
      0,
    ),
    safe(
      "liveRoom",
      () =>
        prisma.liveRoom.findFirst({
          where: { sellerId: userId, status: { in: ["live", "scheduled"] } },
          orderBy: [{ status: "asc" }, { scheduledStartAt: "asc" }],
          select: { id: true, title: true, status: true, scheduledStartAt: true },
        }),
      null,
    ),
    safe(
      "recommendedCategories",
      () =>
        prisma.listing.findMany({
          where: {
            sellerId: userId,
            moderationRemovedAt: null,
            status: { in: ["active", "auction_live", "sold"] },
          },
          select: { category: true },
          take: 200,
          orderBy: { updatedAt: "desc" },
        }),
      [],
    ),
  ]);

  for (const r of [
    auctionEndedUnpaidCountR,
    auctionRecoveryListingR,
    commerceEventsR,
    paidOrdersNeedingLabelCountR,
    paidOrderNeedingLabelR,
    readinessR,
    shipFromAddressesR,
    activeListingsCountR,
    draftListingsCountR,
    openOrdersCountR,
    awaitingShipmentCountR,
    recentSalesCountR,
    unreadBuyerMessagesCountR,
    liveRoomR,
    sellerListingCategoryRowsR,
  ]) {
    if (r.error) partialErrors.push(r.error);
  }

  const categoryCounts = new Map<string, number>();
  for (const row of sellerListingCategoryRowsR.value) {
    const c = row.category?.trim();
    if (!c) continue;
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  }
  const recommendedCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, count }));

  const liveRoom = liveRoomR.value;

  return {
    setupWizardComplete: Boolean(user.sellerSetupWizardCompletedAt),
    sellerSetupWizardCompletedAt: user.sellerSetupWizardCompletedAt?.toISOString() ?? null,
    seller: user,
    stripePlatformConfigured: isStripeConfigured(),
    stripeEmbedOnboardingAvailable:
      isStripeConfigured() && Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
    fulfillmentNextAction,
    auctionRecoveryListingId: auctionRecoveryListingR.value?.id ?? null,
    auctionRecoveryListingTitle: auctionRecoveryListingR.value?.title ?? null,
    auctionEndedUnpaidCount: auctionEndedUnpaidCountR.value,
    paidOrdersNeedingLabelCount: paidOrdersNeedingLabelCountR.value,
    paidOrderNeedingLabelId: paidOrderNeedingLabelR.value?.id ?? null,
    readiness: readinessR.value,
    shipFromAddresses: shipFromAddressesR.value,
    recommendedCategories,
    sellerHomeStats: {
      activeListingsCount: activeListingsCountR.value,
      draftListingsCount: draftListingsCountR.value,
      openOrdersCount: openOrdersCountR.value,
      awaitingShipmentCount: awaitingShipmentCountR.value,
      recentSalesCount: recentSalesCountR.value,
      unreadBuyerMessagesCount: unreadBuyerMessagesCountR.value,
      liveRoom: liveRoom
        ? {
            id: liveRoom.id,
            title: liveRoom.title,
            status: liveRoom.status,
            scheduledStartAt: liveRoom.scheduledStartAt?.toISOString() ?? null,
          }
        : null,
    },
    commerceEvents: commerceEventsR.value.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    ...(partialErrors.length ? { partialErrors } : {}),
    ...(opts?.provisioned ? { provisioned: true } : {}),
  };
}
