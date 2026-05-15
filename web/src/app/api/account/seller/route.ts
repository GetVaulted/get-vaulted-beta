import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { sellerPrimaryNextAction } from "@/lib/seller-fulfillment-next-action";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await processAuctionPaymentExpiries();
  } catch (e) {
    console.error("[api/account/seller] processAuctionPaymentExpiries", e);
  }

  try {
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
      defaultShipFromAddressId: true,
    },
  });
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Your session does not match any user in this database. Sign out and sign in again (common after switching which Postgres database the app uses).",
        code: "SESSION_USER_MISSING",
      },
      { status: 404 },
    );
  }

  const recentSales = await prisma.order.findMany({
    where: { sellerId: session.user.id },
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
  });

  const fulfillmentNextAction = sellerPrimaryNextAction(user, recentSales);

  const [
    auctionEndedUnpaidCount,
    auctionRecoveryListing,
    commerceEvents,
    paidOrdersNeedingLabelCount,
    paidOrderNeedingLabel,
    readiness,
    shipFromAddresses,
  ] =
    await Promise.all([
      prisma.listing.count({
        where: { sellerId: session.user.id, status: "auction_ended_unpaid" },
      }),
      prisma.listing.findFirst({
        where: { sellerId: session.user.id, status: "auction_ended_unpaid" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true },
      }),
      prisma.sellerCommerceEvent.findMany({
        where: { sellerId: session.user.id },
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
      prisma.order.count({
        where: {
          sellerId: session.user.id,
          paymentStatus: "paid",
          shippoTransactionId: null,
          labelUrl: null,
          status: { not: "cancelled" },
        },
      }),
      prisma.order.findFirst({
        where: {
          sellerId: session.user.id,
          paymentStatus: "paid",
          shippoTransactionId: null,
          labelUrl: null,
          status: { not: "cancelled" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
      getSellerLiveReadiness(session.user.id, prisma),
      prisma.address.findMany({
        where: { userId: session.user.id, type: "ship_from" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
    ]);

  const [activeListingsCount, draftListingsCount, openOrdersCount, awaitingShipmentCount, recentSalesCount, unreadBuyerMessagesCount, liveRoom] =
    await Promise.all([
      prisma.listing.count({
        where: { sellerId: session.user.id, status: { in: ["active", "auction_live"] }, moderationRemovedAt: null },
      }),
      prisma.listing.count({
        where: { sellerId: session.user.id, status: "draft", moderationRemovedAt: null },
      }),
      prisma.order.count({
        where: {
          sellerId: session.user.id,
          status: { notIn: ["delivered", "cancelled"] },
        },
      }),
      prisma.order.count({
        where: {
          sellerId: session.user.id,
          paymentStatus: "paid",
          fulfillmentStatus: { in: ["pending", "processing"] },
          status: { not: "cancelled" },
        },
      }),
      prisma.order.count({
        where: {
          sellerId: session.user.id,
          paymentStatus: "paid",
        },
      }),
      prisma.message.count({
        where: {
          recipientId: session.user.id,
          readAt: null,
        },
      }),
      prisma.liveRoom.findFirst({
        where: {
          sellerId: session.user.id,
          status: { in: ["live", "scheduled"] },
        },
        orderBy: [{ status: "asc" }, { scheduledStartAt: "asc" }],
        select: {
          id: true,
          title: true,
          status: true,
          scheduledStartAt: true,
        },
      }),
    ]);

  // Lightweight seller profile suggestions: infer “favorite categories” from the categories you sell most.
  // This is non-blocking UI and does not require any new stored profile fields.
  const sellerListingCategoryRows = await prisma.listing.findMany({
    where: {
      sellerId: session.user.id,
      moderationRemovedAt: null,
      status: { in: ["active", "auction_live", "sold"] },
    },
    select: { category: true },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  const categoryCounts = new Map<string, number>();
  for (const row of sellerListingCategoryRows) {
    const c = row.category?.trim();
    if (!c) continue;
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  }
  const recommendedCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, count }));

  return NextResponse.json({
    seller: user,
    /** Server-only: whether `STRIPE_SECRET_KEY` is set (never infer this in `"use client"` code). */
    stripePlatformConfigured: isStripeConfigured(),
    fulfillmentNextAction: fulfillmentNextAction.label,
    auctionRecoveryListingId: auctionRecoveryListing?.id ?? null,
    auctionRecoveryListingTitle: auctionRecoveryListing?.title ?? null,
    auctionEndedUnpaidCount,
    paidOrdersNeedingLabelCount,
    paidOrderNeedingLabelId: paidOrderNeedingLabel?.id ?? null,
    readiness,
    shipFromAddresses,
    recommendedCategories,
    sellerHomeStats: {
      activeListingsCount,
      draftListingsCount,
      openOrdersCount,
      awaitingShipmentCount,
      recentSalesCount,
      unreadBuyerMessagesCount,
      liveRoom: liveRoom
        ? {
            id: liveRoom.id,
            title: liveRoom.title,
            status: liveRoom.status,
            scheduledStartAt: liveRoom.scheduledStartAt?.toISOString() ?? null,
          }
        : null,
    },
    commerceEvents: commerceEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  });
  } catch (e) {
    console.error("[api/account/seller] GET", e);
    return NextResponse.json(
      {
        error: "Seller settings could not be loaded. Check your database connection or try again.",
      },
      { status: 503 },
    );
  }
}

type PatchBody = {
  shipFromName?: unknown;
  shipFromStreet?: unknown;
  shipFromCity?: unknown;
  shipFromState?: unknown;
  shipFromZip?: unknown;
  shipFromCountry?: unknown;
  defaultShipFromAddressId?: unknown;
};

function trim(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return "";
  return t.slice(0, max);
}

export async function PATCH(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shipFromName = trim(body.shipFromName, 200) ?? "";
  const shipFromStreet = trim(body.shipFromStreet, 300) ?? "";
  const shipFromCity = trim(body.shipFromCity, 120) ?? "";
  const shipFromState = trim(body.shipFromState, 120) ?? "";
  const shipFromZip = trim(body.shipFromZip, 32) ?? "";
  const shipFromCountry = trim(body.shipFromCountry, 120) ?? "";

  if (!shipFromStreet || !shipFromCity || !shipFromState || !shipFromZip || !shipFromCountry) {
    return NextResponse.json({ error: "Please complete your address." }, { status: 400 });
  }

  const baseUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      defaultShipFromAddressId: true,
    },
  });
  if (!baseUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let requestedDefaultShipFromAddressId: string | null | undefined;
  if (body.defaultShipFromAddressId === null || typeof body.defaultShipFromAddressId === "string") {
    requestedDefaultShipFromAddressId =
      typeof body.defaultShipFromAddressId === "string" ? body.defaultShipFromAddressId.trim() || null : null;
  }

  const defaultAddress = await prisma.$transaction(async (tx) => {
    const requestedId = requestedDefaultShipFromAddressId;
    let selectedAddress =
      requestedId
        ? await tx.address.findFirst({
            where: { id: requestedId, userId: session.user.id, type: "ship_from" },
          })
        : null;

    if (!selectedAddress && baseUser.defaultShipFromAddressId) {
      selectedAddress = await tx.address.findFirst({
        where: { id: baseUser.defaultShipFromAddressId, userId: session.user.id, type: "ship_from" },
      });
    }

    if (!selectedAddress) {
      selectedAddress = await tx.address.findFirst({
        where: { userId: session.user.id, type: "ship_from" },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      });
    }

    const fullName = shipFromName || baseUser.name?.trim() || baseUser.username;
    const name = shipFromName || "Shipping address";
    const email = baseUser.email?.trim() || null;

    await tx.address.updateMany({
      where: { userId: session.user.id, type: "ship_from" },
      data: { isDefault: false },
    });

    if (selectedAddress) {
      return tx.address.update({
        where: { id: selectedAddress.id },
        data: {
          type: "ship_from",
          name,
          fullName,
          line1: shipFromStreet,
          city: shipFromCity,
          state: shipFromState,
          postalCode: shipFromZip,
          country: shipFromCountry,
          email,
          isDefault: true,
        },
      });
    }

    return tx.address.create({
      data: {
        userId: session.user.id,
        type: "ship_from",
        name,
        fullName,
        line1: shipFromStreet,
        city: shipFromCity,
        state: shipFromState,
        postalCode: shipFromZip,
        country: shipFromCountry,
        email,
        isDefault: true,
      },
    });
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      shipFromName: shipFromName || null,
      shipFromStreet,
      shipFromCity,
      shipFromState,
      shipFromZip,
      shipFromCountry,
      defaultShipFromAddressId: defaultAddress.id,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
      defaultShipFromAddressId: true,
    },
  });

  const readiness = await getSellerLiveReadiness(session.user.id, prisma);
  return NextResponse.json({ seller: user, readiness, message: "Shipping address saved." });
}
