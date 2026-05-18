import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { computeAuctionEndsAt } from "@/lib/auction";
import { auctionBidCountsByListingIds } from "@/lib/listing-bid-counts";
import { hasCompleteParcel } from "@/lib/listing-publish";
import { prisma } from "@/lib/prisma";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { assertSellerCanPublishListing } from "@/lib/seller-publish-readiness";
import { dbListingToMarketplace, dbListingToStored } from "@/lib/listing-mapper";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { LISTING_WORKSPACE_KEY } from "@/lib/listing-workspace";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import type { BuyingFormat, ListingStatus } from "@/generated/prisma/client";
import type { ShippingCategory } from "@/generated/prisma/enums";

const listingInclude = listingWithSellerFulfillmentInclude;

async function pendingOfferCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.offer.groupBy({
    by: ["listingId"],
    where: { listingId: { in: ids }, status: "pending" },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.listingId, r._count._all]));
}

async function replaceListingImages(listingId: string, urls: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({ where: { listingId } });
    if (urls.length === 0) return;
    await tx.listingImage.createMany({
      data: urls.map((url, sortOrder) => ({ listingId, url, sortOrder })),
    });
  });
}

function parseBuyingFormat(v: unknown): BuyingFormat | null {
  if (v === "buy_now" || v === "auction") return v;
  return null;
}

function parseStatus(v: unknown): ListingStatus | null {
  if (v === "draft" || v === "active" || v === "sold" || v === "auction_live") return v;
  return null;
}

type ListingBody = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  buyingFormat?: unknown;
  priceUsd?: unknown;
  startingBidUsd?: unknown;
  currentBidUsd?: unknown;
  reservePriceUsd?: unknown;
  auctionDurationDays?: unknown;
  shippingPriceUsd?: unknown;
  handlingTime?: string;
  signatureRequired?: unknown;
  allowOffers?: unknown;
  acceptTradeOffers?: unknown;
  minimumOfferUsd?: unknown;
  status?: unknown;
  images?: unknown;
  workspaceKey?: unknown;
  duplicateFromId?: unknown;
  vaultPick?: unknown;
  parcelWeightOz?: unknown;
  parcelLengthIn?: unknown;
  parcelWidthIn?: unknown;
  parcelHeightIn?: unknown;
  shippingBaseWeightOz?: unknown;
  shippingIncrementalWeightOz?: unknown;
  shippingPriceCapCents?: unknown;
  shippingCategory?: unknown;
  shipAlone?: unknown;
  shipFromAddressId?: unknown;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  if (scope === "ids") {
    const ids = (searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 60);
    if (!ids.length) return NextResponse.json({ listings: [] });
    const rows = await prisma.listing.findMany({
      where: {
        id: { in: ids },
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
      },
      include: listingInclude,
    });
    const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
    const bidCounts = await auctionBidCountsByListingIds(auctionIds);
    return NextResponse.json({
      listings: rows.map((r) =>
        dbListingToMarketplace(r, r.buyingFormat === "auction" ? { bidCount: bidCounts.get(r.id) ?? 0 } : undefined),
      ),
    });
  }

  if (scope === "merch") {
    const rows = await prisma.listing.findMany({
      where: {
        isCompanyListing: true,
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
      },
      include: listingInclude,
      orderBy: { createdAt: "desc" },
    });
    const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
    const bidCounts = await auctionBidCountsByListingIds(auctionIds);
    return NextResponse.json({
      listings: rows.map((r) =>
        dbListingToMarketplace(
          r,
          r.buyingFormat === "auction" ? { bidCount: bidCounts.get(r.id) ?? 0 } : undefined,
        ),
      ),
    });
  }

  if (scope === "published") {
    const rows = await prisma.listing.findMany({
      where: {
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
        isCompanyListing: false,
        seller: prismaSellerVisibleOnPublicMarketplace(),
      },
      include: listingInclude,
      orderBy: { createdAt: "desc" },
    });
    const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
    const bidCounts = await auctionBidCountsByListingIds(auctionIds);
    return NextResponse.json({
      listings: rows.map((r) =>
        dbListingToMarketplace(
          r,
          r.buyingFormat === "auction" ? { bidCount: bidCounts.get(r.id) ?? 0 } : undefined,
        ),
      ),
    });
  }

  if (scope === "mine") {
    const auth = await resolveListingsUserId(req);
    if (auth instanceof NextResponse) return auth;
    await processAuctionPaymentExpiries();
    const rows = await prisma.listing.findMany({
      where: { sellerId: auth.userId },
      include: listingInclude,
      orderBy: { updatedAt: "desc" },
    });
    const counts = await pendingOfferCounts(rows.map((r) => r.id));
    const auctionIds = rows.filter((r) => r.buyingFormat === "auction").map((r) => r.id);
    const bidCounts = await auctionBidCountsByListingIds(auctionIds);
    const awaitingIds = rows.filter((r) => r.status === "awaiting_auction_payment").map((r) => r.id);
    const orderDeadlines =
      awaitingIds.length > 0
        ? await prisma.order.findMany({
            where: { listingId: { in: awaitingIds } },
            select: { listingId: true, paymentDeadlineAt: true },
          })
        : [];
    const deadlineByListing = new Map(
      orderDeadlines.map((o) => [o.listingId, o.paymentDeadlineAt?.toISOString() ?? null]),
    );
    return NextResponse.json({
      listings: rows.map((r) =>
        dbListingToStored(
          r,
          counts.get(r.id) ?? 0,
          r.buyingFormat === "auction" ? bidCounts.get(r.id) ?? 0 : undefined,
          { auctionPaymentDeadlineIso: deadlineByListing.get(r.id) ?? null },
        ),
      ),
    });
  }

  if (scope === "workspace") {
    const auth = await resolveListingsUserId(req);
    if (auth instanceof NextResponse) return auth;
    await processAuctionPaymentExpiries();
    const row = await prisma.listing.findFirst({
      where: { sellerId: auth.userId, workspaceKey: LISTING_WORKSPACE_KEY },
      include: listingInclude,
    });
    if (!row) return NextResponse.json({ listing: null });
    const c = await prisma.offer.count({ where: { listingId: row.id, status: "pending" } });
    const bc =
      row.buyingFormat === "auction" ? await prisma.bid.count({ where: { listingId: row.id } }) : undefined;
    let auctionPaymentDeadlineIso: string | null | undefined;
    if (row.status === "awaiting_auction_payment") {
      const ord = await prisma.order.findUnique({
        where: { listingId: row.id },
        select: { paymentDeadlineAt: true },
      });
      auctionPaymentDeadlineIso = ord?.paymentDeadlineAt?.toISOString() ?? null;
    }
    return NextResponse.json({ listing: dbListingToStored(row, c, bc, { auctionPaymentDeadlineIso }) });
  }

  return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
}

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const sessionUserId = auth.userId;

  let body: ListingBody;
  try {
    body = (await req.json()) as ListingBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.duplicateFromId != null && String(body.duplicateFromId).length > 0) {
    const srcId = String(body.duplicateFromId);
    const src = await prisma.listing.findFirst({
      where: { id: srcId, sellerId: sessionUserId },
      include: { images: true },
    });
    if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

    /** Duplicates are always drafts so the seller can review before publishing. */
    const row = await prisma.listing.create({
      data: {
        sellerId: sessionUserId,
        title: `${src.title} (copy)`,
        description: src.description,
        category: src.category,
        condition: src.condition,
        buyingFormat: src.buyingFormat,
        priceUsd: src.priceUsd,
        startingBidUsd: src.startingBidUsd,
        currentBidUsd: null,
        allowOffers: src.allowOffers,
        acceptTradeOffers: src.acceptTradeOffers,
        minimumOfferUsd: src.minimumOfferUsd,
        status: "draft",
        shippingPriceUsd: src.shippingPriceUsd,
        handlingTime: src.handlingTime,
        signatureRequired: src.signatureRequired,
        reservePriceUsd: src.reservePriceUsd,
        auctionDurationDays: src.auctionDurationDays,
        auctionEndsAt: null,
        viewsCount: 0,
        watchersCount: 0,
        vaultPick: src.vaultPick,
        isCompanyListing: false,
        workspaceKey: null,
        shippingBaseWeightOz: src.shippingBaseWeightOz,
        shippingIncrementalWeightOz: src.shippingIncrementalWeightOz,
        shippingPriceCapCents: src.shippingPriceCapCents,
        shippingCategory: src.shippingCategory,
        shipAlone: src.shipAlone,
      },
      include: listingInclude,
    });
    await replaceListingImages(
      row.id,
      [...src.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    );
    const full = await prisma.listing.findUniqueOrThrow({ where: { id: row.id }, include: listingInclude });
    const offers = await prisma.offer.count({ where: { listingId: full.id, status: "pending" } });
    const bc = full.buyingFormat === "auction" ? await prisma.bid.count({ where: { listingId: full.id } }) : undefined;
    return NextResponse.json({ listing: dbListingToStored(full, offers, bc) });
  }

  const images = Array.isArray(body.images) ? body.images.filter((x): x is string => typeof x === "string") : [];
  const buyingFormat = parseBuyingFormat(body.buyingFormat);
  if (!buyingFormat) return NextResponse.json({ error: "Invalid buyingFormat" }, { status: 400 });

  const status = parseStatus(body.status) ?? "draft";
  const publishedLive = status === "active" || status === "auction_live";
  if (publishedLive && images.length === 0) {
    return NextResponse.json({ error: "At least one image is required to publish." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Other";
  const condition = typeof body.condition === "string" && body.condition.trim() ? body.condition.trim() : "Other";
  const description = typeof body.description === "string" ? body.description : "";
  const handlingTime = typeof body.handlingTime === "string" ? body.handlingTime : "";
  const allowOffers = Boolean(body.allowOffers);
  const acceptTradeOffers = Boolean(body.acceptTradeOffers);
  const signatureRequired = Boolean(body.signatureRequired);
  const vaultPick = Boolean(body.vaultPick);

  const priceUsd = typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) ? body.priceUsd : null;
  const startingBidUsd =
    typeof body.startingBidUsd === "number" && Number.isFinite(body.startingBidUsd) ? body.startingBidUsd : null;
  const reservePriceUsd =
    typeof body.reservePriceUsd === "number" && Number.isFinite(body.reservePriceUsd) ? body.reservePriceUsd : null;
  const auctionDurationDays =
    typeof body.auctionDurationDays === "number" && Number.isFinite(body.auctionDurationDays)
      ? Math.floor(body.auctionDurationDays)
      : null;
  const shippingPriceUsd =
    typeof body.shippingPriceUsd === "number" && Number.isFinite(body.shippingPriceUsd) ? body.shippingPriceUsd : 0;
  const minimumOfferUsd =
    typeof body.minimumOfferUsd === "number" && Number.isFinite(body.minimumOfferUsd) ? body.minimumOfferUsd : null;

  const resolvedPrice =
    buyingFormat === "buy_now"
      ? priceUsd ?? 1
      : startingBidUsd ?? priceUsd ?? 1;
  const resolvedStart = buyingFormat === "auction" ? startingBidUsd ?? priceUsd ?? resolvedPrice : null;
  const resolvedCurrent =
    buyingFormat === "auction"
      ? typeof body.currentBidUsd === "number" && Number.isFinite(body.currentBidUsd)
        ? body.currentBidUsd
        : null
      : null;

  const workspaceKey = body.workspaceKey === LISTING_WORKSPACE_KEY ? LISTING_WORKSPACE_KEY : null;

  const auctionPublished = buyingFormat === "auction" && (status === "auction_live" || status === "active");

  const parseParcel = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    return v;
  };
  const parseWeight = (v: unknown, fallback: number): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
    return v;
  };
  const parcelWeightOz = parseParcel(body.parcelWeightOz);
  const parcelLengthIn = parseParcel(body.parcelLengthIn);
  const parcelWidthIn = parseParcel(body.parcelWidthIn);
  const parcelHeightIn = parseParcel(body.parcelHeightIn);
  const shippingCategory: ShippingCategory =
    body.shippingCategory === "raw_card" ||
    body.shippingCategory === "slab" ||
    body.shippingCategory === "small_collectible" ||
    body.shippingCategory === "custom"
      ? body.shippingCategory
      : "raw_card";
  const defaultWeightsByCategory: Record<string, { base: number; incremental: number }> = {
    raw_card: {
      base: Number(process.env.DEFAULT_RAW_CARD_BASE_WEIGHT_OZ ?? 4),
      incremental: Number(process.env.DEFAULT_RAW_CARD_INCREMENTAL_WEIGHT_OZ ?? 1),
    },
    slab: {
      base: Number(process.env.DEFAULT_SLAB_BASE_WEIGHT_OZ ?? 8),
      incremental: Number(process.env.DEFAULT_SLAB_INCREMENTAL_WEIGHT_OZ ?? 3),
    },
    small_collectible: {
      base: Number(process.env.DEFAULT_SMALL_COLLECTIBLE_BASE_WEIGHT_OZ ?? 6),
      incremental: Number(process.env.DEFAULT_SMALL_COLLECTIBLE_INCREMENTAL_WEIGHT_OZ ?? 2),
    },
    custom: { base: 4, incremental: 1 },
  };
  const defaults = defaultWeightsByCategory[shippingCategory] ?? defaultWeightsByCategory.raw_card;
  const shippingBaseWeightOz = parseWeight(body.shippingBaseWeightOz, defaults.base);
  const shippingIncrementalWeightOz = parseWeight(body.shippingIncrementalWeightOz, defaults.incremental);
  const shippingPriceCapCents =
    typeof body.shippingPriceCapCents === "number" &&
    Number.isFinite(body.shippingPriceCapCents) &&
    body.shippingPriceCapCents >= 0
      ? Math.floor(body.shippingPriceCapCents)
      : Math.floor(Number(process.env.LIVE_SHIPPING_CAP_CENTS ?? 1199));
  const shipAlone = Boolean(body.shipAlone);
  const shipFromAddressId =
    typeof body.shipFromAddressId === "string" && body.shipFromAddressId.trim().length > 0
      ? body.shipFromAddressId.trim()
      : null;
  const parcelRow = { parcelWeightOz, parcelLengthIn, parcelWidthIn, parcelHeightIn };

  if (publishedLive && !hasCompleteParcel(parcelRow)) {
    return NextResponse.json(
      {
        error: "Add parcel weight (oz) and length, width, and height (inches) before publishing — required for shipping labels.",
        code: "PARCEL_REQUIRED",
      },
      { status: 400 },
    );
  }

  if (publishedLive) {
    if (shipFromAddressId) {
      const owned = await prisma.address.findFirst({
        where: {
          id: shipFromAddressId,
          userId: sessionUserId,
          type: "ship_from",
        },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Select a valid ship-from address before publishing." }, { status: 400 });
      }
    }
    try {
      await assertSellerCanPublishListing(prisma, sessionUserId, {
        shippingBaseWeightOz,
        shippingIncrementalWeightOz,
        shippingCategory,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "SELLER_REQUIREMENTS_INCOMPLETE") {
        const issues = (e as Error & { issues?: string[] }).issues ?? [];
        return NextResponse.json(
          {
            error: "SELLER_REQUIREMENTS_INCOMPLETE",
            issues,
          },
          { status: 403 },
        );
      }
      throw e;
    }
  }

  if (auctionPublished) {
    const start = resolvedStart;
    if (start == null || !Number.isFinite(start) || start <= 0) {
      return NextResponse.json({ error: "A valid starting bid is required to publish an auction." }, { status: 400 });
    }
    if (auctionDurationDays == null || auctionDurationDays < 1 || auctionDurationDays > 365) {
      return NextResponse.json({ error: "Auction duration (1–365 days) is required to publish." }, { status: 400 });
    }
  }

  const effectiveStatus: ListingStatus =
    buyingFormat === "auction" && auctionPublished ? "auction_live" : status;

  const baseData = {
    title: title || "Untitled draft",
    description,
    category,
    condition,
    buyingFormat,
    priceUsd: resolvedPrice,
    startingBidUsd: buyingFormat === "auction" ? resolvedStart : null,
    currentBidUsd: buyingFormat === "auction" ? resolvedCurrent : null,
    allowOffers,
    acceptTradeOffers,
    minimumOfferUsd: minimumOfferUsd ?? null,
    status: effectiveStatus,
    shippingPriceUsd,
    handlingTime: handlingTime || "—",
    signatureRequired,
    reservePriceUsd: buyingFormat === "auction" ? reservePriceUsd : null,
    auctionDurationDays: buyingFormat === "auction" ? auctionDurationDays ?? undefined : null,
    vaultPick,
    parcelWeightOz,
    parcelLengthIn,
    parcelWidthIn,
    parcelHeightIn,
    shippingBaseWeightOz,
    shippingIncrementalWeightOz,
    shippingPriceCapCents,
    shippingCategory,
    shipAlone,
    shipFromAddressId,
    ...(auctionPublished ? { auctionEndsAt: computeAuctionEndsAt(new Date(), auctionDurationDays) } : {}),
  };

  if (workspaceKey && status === "draft") {
    const row = await prisma.listing.upsert({
      where: {
        sellerId_workspaceKey: {
          sellerId: sessionUserId,
          workspaceKey: LISTING_WORKSPACE_KEY,
        },
      },
      create: {
        sellerId: sessionUserId,
        workspaceKey: LISTING_WORKSPACE_KEY,
        ...baseData,
      },
      update: {
        ...baseData,
        workspaceKey: LISTING_WORKSPACE_KEY,
      },
      include: listingInclude,
    });
    await replaceListingImages(row.id, images);
    const full = await prisma.listing.findUniqueOrThrow({ where: { id: row.id }, include: listingInclude });
    const offers = await prisma.offer.count({ where: { listingId: full.id, status: "pending" } });
    const bc = full.buyingFormat === "auction" ? await prisma.bid.count({ where: { listingId: full.id } }) : undefined;
    return NextResponse.json({ listing: dbListingToStored(full, offers, bc) });
  }

  const row = await prisma.listing.create({
    data: {
      sellerId: sessionUserId,
      ...baseData,
      workspaceKey: null,
    },
    include: listingInclude,
  });
  await replaceListingImages(row.id, images);
  const full = await prisma.listing.findUniqueOrThrow({ where: { id: row.id }, include: listingInclude });
  const offers = await prisma.offer.count({ where: { listingId: full.id, status: "pending" } });
  const bc = full.buyingFormat === "auction" ? await prisma.bid.count({ where: { listingId: full.id } }) : undefined;
  return NextResponse.json({ listing: dbListingToStored(full, offers, bc) });
}
