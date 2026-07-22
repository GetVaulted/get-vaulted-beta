import { NextResponse } from "next/server";
import type { BuyingFormat, ListingStatus, Prisma, ShippingCategory } from "@/generated/prisma/client";
import { computeAuctionEndsAt } from "@/lib/auction";
import { hasCompleteParcel } from "@/lib/listing-publish";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { assertSellerCanPublishListing } from "@/lib/seller-publish-readiness";

const listingInclude = listingWithSellerFulfillmentInclude;

const STATUSES: ListingStatus[] = ["draft", "active", "sold", "auction_live"];
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 50;
const CHANNELS = ["marketplace", "live"] as const;
type ListingChannel = (typeof CHANNELS)[number];

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") ?? "all").trim();
  const category = (searchParams.get("category") ?? "all").trim();
  const seller = (searchParams.get("seller") ?? "").trim();
  const channelRaw = (searchParams.get("channel") ?? "marketplace").trim().toLowerCase();
  const channel: ListingChannel = CHANNELS.includes(channelRaw as ListingChannel)
    ? (channelRaw as ListingChannel)
    : "marketplace";
  const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(PAGE_SIZE_MAX, Math.floor(pageSizeRaw))
      : PAGE_SIZE_DEFAULT;

  const where: Prisma.ListingWhereInput = {};

  if (statusParam === "removed") {
    where.moderationRemovedAt = { not: null };
  } else if (statusParam !== "all" && (STATUSES as string[]).includes(statusParam)) {
    where.status = statusParam as ListingStatus;
  }

  if (category !== "all" && category.length > 0) {
    where.category = category;
  }

  if (seller.length > 0) {
    const isCuid = /^c[a-z0-9]{20,}$/i.test(seller);
    if (isCuid) {
      where.sellerId = seller;
    } else {
      where.seller = {
        OR: [{ username: { contains: seller } }, { email: { contains: seller } }],
      };
    }
  }

  // Live = tied to a show lot; Marketplace = never queued/sold through live rooms.
  if (channel === "live") {
    where.liveRoomItems = { some: {} };
  } else {
    where.liveRoomItems = { none: {} };
  }

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    statusParam === "removed" ? { moderationRemovedAt: "desc" } : { updatedAt: "desc" };

  try {
    const [total, rows, categories] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        include: {
          seller: { select: { id: true, username: true, email: true } },
          _count: { select: { liveRoomItems: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.listing.findMany({
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
        take: 80,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      listings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        buyingFormat: r.buyingFormat,
        priceUsd: r.priceUsd,
        sellerId: r.sellerId,
        sellerUsername: r.seller?.username ?? "unknown",
        sellerEmail: r.seller?.email ?? "",
        isCompanyListing: r.isCompanyListing,
        channel: r._count.liveRoomItems > 0 ? "live" : "marketplace",
        moderationRemovedAt: r.moderationRemovedAt?.toISOString() ?? null,
        adminReviewedAt: r.adminReviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      categories: categories.map((c) => c.category),
      page,
      pageSize,
      total,
      totalPages,
      channel,
    });
  } catch (e) {
    console.error("[admin/listings GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load listings." },
      { status: 500 },
    );
  }
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

type PostBody = {
  sellerId?: string;
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  buyingFormat?: BuyingFormat;
  priceUsd?: number;
  shippingPriceUsd?: number;
  status?: ListingStatus;
  isCompanyListing?: boolean;
  images?: unknown;
  handlingTime?: string;
  parcelWeightOz?: number;
  parcelLengthIn?: number;
  parcelWidthIn?: number;
  parcelHeightIn?: number;
  shippingBaseWeightOz?: number;
  shippingIncrementalWeightOz?: number;
  shippingCategory?: ShippingCategory;
  shipFromAddressId?: string | null;
  auctionDurationDays?: number | null;
  startingBidUsd?: number | null;
};

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  if (!sellerId) return NextResponse.json({ error: "sellerId is required." }, { status: 400 });

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required." }, { status: 400 });

  const buyingFormat: BuyingFormat = body.buyingFormat === "auction" ? "auction" : "buy_now";
  const status: ListingStatus =
    body.status === "draft" || body.status === "active" || body.status === "auction_live"
      ? body.status
      : "draft";

  const publishedLive = status === "active" || status === "auction_live";
  const images = Array.isArray(body.images) ? body.images.filter((x): x is string => typeof x === "string") : [];
  if (publishedLive && images.length === 0) {
    return NextResponse.json({ error: "At least one image is required to publish." }, { status: 400 });
  }

  const isCompanyListing = Boolean(body.isCompanyListing);
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Other";
  const condition = typeof body.condition === "string" && body.condition.trim() ? body.condition.trim() : "Other";
  const description = typeof body.description === "string" ? body.description : "";
  const handlingTime = typeof body.handlingTime === "string" && body.handlingTime.trim() ? body.handlingTime : "—";
  const priceUsd = typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) ? body.priceUsd : 0;
  if (priceUsd <= 0) return NextResponse.json({ error: "priceUsd must be positive." }, { status: 400 });

  const shippingPriceUsd =
    typeof body.shippingPriceUsd === "number" && Number.isFinite(body.shippingPriceUsd) ? body.shippingPriceUsd : 0;

  const parcelWeightOz = typeof body.parcelWeightOz === "number" ? body.parcelWeightOz : null;
  const parcelLengthIn = typeof body.parcelLengthIn === "number" ? body.parcelLengthIn : null;
  const parcelWidthIn = typeof body.parcelWidthIn === "number" ? body.parcelWidthIn : null;
  const parcelHeightIn = typeof body.parcelHeightIn === "number" ? body.parcelHeightIn : null;
  const parcelRow = { parcelWeightOz, parcelLengthIn, parcelWidthIn, parcelHeightIn };

  if (publishedLive && !hasCompleteParcel(parcelRow)) {
    return NextResponse.json(
      { error: "Parcel weight and dimensions are required before publishing.", code: "PARCEL_REQUIRED" },
      { status: 400 },
    );
  }

  const shippingCategory: ShippingCategory =
    body.shippingCategory === "raw_card" ||
    body.shippingCategory === "slab" ||
    body.shippingCategory === "small_collectible" ||
    body.shippingCategory === "custom"
      ? body.shippingCategory
      : "raw_card";

  const shippingBaseWeightOz =
    typeof body.shippingBaseWeightOz === "number" && Number.isFinite(body.shippingBaseWeightOz) && body.shippingBaseWeightOz > 0
      ? body.shippingBaseWeightOz
      : 4;
  const shippingIncrementalWeightOz =
    typeof body.shippingIncrementalWeightOz === "number" &&
    Number.isFinite(body.shippingIncrementalWeightOz) &&
    body.shippingIncrementalWeightOz >= 0
      ? body.shippingIncrementalWeightOz
      : 1;

  const shipFromAddressId =
    typeof body.shipFromAddressId === "string" && body.shipFromAddressId.trim().length > 0
      ? body.shipFromAddressId.trim()
      : null;

  if (publishedLive) {
    if (shipFromAddressId) {
      const owned = await prisma.address.findFirst({
        where: { id: shipFromAddressId, userId: sellerId, type: "ship_from" },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Select a valid ship-from address for this seller." }, { status: 400 });
      }
    }
    try {
      await assertSellerCanPublishListing(prisma, sellerId, {
        shippingBaseWeightOz,
        shippingIncrementalWeightOz,
        shippingCategory,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "SELLER_REQUIREMENTS_INCOMPLETE") {
        const issues = (e as Error & { issues?: string[] }).issues ?? [];
        return NextResponse.json({ error: "SELLER_REQUIREMENTS_INCOMPLETE", issues }, { status: 403 });
      }
      throw e;
    }
  }

  const startingBidUsd =
    buyingFormat === "auction"
      ? typeof body.startingBidUsd === "number" && Number.isFinite(body.startingBidUsd)
        ? body.startingBidUsd
        : priceUsd
      : null;

  const auctionDurationDays =
    buyingFormat === "auction"
      ? typeof body.auctionDurationDays === "number" && Number.isFinite(body.auctionDurationDays)
        ? Math.floor(body.auctionDurationDays)
        : null
      : null;

  const auctionPublished = buyingFormat === "auction" && publishedLive;
  if (auctionPublished) {
    if (startingBidUsd == null || !Number.isFinite(startingBidUsd) || startingBidUsd <= 0) {
      return NextResponse.json({ error: "A valid starting bid is required to publish an auction." }, { status: 400 });
    }
    if (auctionDurationDays == null || auctionDurationDays < 1 || auctionDurationDays > 365) {
      return NextResponse.json({ error: "Auction duration (1–365 days) is required to publish." }, { status: 400 });
    }
  }

  const effectiveStatus: ListingStatus =
    buyingFormat === "auction" && auctionPublished ? "auction_live" : status;

  const row = await prisma.listing.create({
    data: {
      sellerId,
      title,
      description,
      category,
      condition,
      buyingFormat,
      priceUsd: buyingFormat === "auction" ? startingBidUsd ?? priceUsd : priceUsd,
      startingBidUsd: buyingFormat === "auction" ? startingBidUsd : null,
      currentBidUsd: null,
      allowOffers: false,
      acceptTradeOffers: false,
      minimumOfferUsd: null,
      status: effectiveStatus,
      shippingPriceUsd,
      handlingTime,
      signatureRequired: false,
      reservePriceUsd: null,
      auctionDurationDays: buyingFormat === "auction" ? auctionDurationDays ?? undefined : null,
      auctionEndsAt:
        auctionPublished && auctionDurationDays != null
          ? computeAuctionEndsAt(new Date(), auctionDurationDays)
          : null,
      viewsCount: 0,
      watchersCount: 0,
      vaultPick: false,
      isCompanyListing,
      workspaceKey: null,
      parcelWeightOz,
      parcelLengthIn,
      parcelWidthIn,
      parcelHeightIn,
      shippingBaseWeightOz,
      shippingIncrementalWeightOz,
      shippingPriceCapCents: Math.floor(Number(process.env.LIVE_SHIPPING_CAP_CENTS ?? 1199)),
      shippingCategory,
      shipAlone: false,
      shipFromAddressId,
    },
    include: listingInclude,
  });

  await replaceListingImages(row.id, images);

  const full = await prisma.listing.findUniqueOrThrow({ where: { id: row.id }, include: listingInclude });
  return NextResponse.json({
    listing: {
      id: full.id,
      title: full.title,
      status: full.status,
      isCompanyListing: full.isCompanyListing,
      sellerId: full.sellerId,
    },
  });
}
