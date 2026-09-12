import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveListingsUserId, resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { computeAuctionEndsAt } from "@/lib/auction";
import { hasCompleteParcel } from "@/lib/listing-publish";
import { closeAuctionIfDuePrisma } from "@/lib/auction-close";
import { isListingMarketplaceDetailVisible, isListingPubliclyVisible } from "@/lib/listing-moderation";
import { getLatestEndRequestForListing } from "@/lib/listing-end-service";
import { prisma } from "@/lib/prisma";
import { assertSellerCanPublishListing } from "@/lib/seller-publish-readiness";
import { dbListingToMarketplace, dbListingToStored } from "@/lib/listing-mapper";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { listingWithSellerFulfillmentInclude } from "@/lib/listing-with-seller-include";
import {
  isMarketplaceTimedAuctionPublishAttempt,
  MARKETPLACE_AUCTION_DISABLED_MESSAGE,
} from "@/lib/marketplace-commerce-policy";
import {
  parseMarketplaceAllowedCarriers,
  parseMarketplaceAllowedRateKeys,
  parseMarketplaceShippingOfferScope,
  marketplaceListingRateKey,
} from "@/lib/marketplace-shipping-offer";
import { resolveAllowLayawayForListing } from "@/lib/layaway/eligibility";
import { LAYAWAY_MIN_LISTING_PRICE_USD } from "@/lib/layaway/constants";
import type { BuyingFormat, ListingStatus } from "@/generated/prisma/client";
import { validateListingImageCount } from "@/lib/listing-photo-requirements";
import { maybeEmitMarketplaceCatalogChanged } from "@/lib/listing-catalog-emit";

const listingInclude = listingWithSellerFulfillmentInclude;

async function replaceListingImages(listingId: string, urls: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({ where: { listingId } });
    if (urls.length === 0) return;
    await tx.listingImage.createMany({
      data: urls.map((url, sortOrder) => ({ listingId, url, sortOrder })),
    });
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const session = await getServerSessionSafe();
  const bearerUserId = await resolveOptionalListingsUserId(req);
  const viewerUserId = bearerUserId ?? session?.user?.id ?? null;

  await closeAuctionIfDuePrisma(id);

  const row = await prisma.listing.findUnique({
    where: { id },
    include: listingInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = viewerUserId === row.sellerId;
  const isAdmin = session?.user?.role === "admin";
  const isPublic = isListingPubliclyVisible(row);
  const isDetailVisible = isListingMarketplaceDetailVisible(row);
  const ownerCanView = isOwner && (isDetailVisible || row.status === "ended" || row.status === "draft");
  if (!isDetailVisible && !ownerCanView && !isAdmin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isPublic && isHiddenFixtureSellerEmail(row.seller.email) && !isOwner && !isAdmin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pending = isOwner ? await prisma.offer.count({ where: { listingId: row.id, status: "pending" } }) : 0;
  const [bc, sellerCompletedOrderCount] = await Promise.all([
    row.buyingFormat === "auction"
      ? prisma.bid.count({ where: { listingId: row.id } })
      : Promise.resolve(undefined),
    prisma.order.count({ where: { sellerId: row.sellerId } }),
  ]);
  let auctionPaymentDeadlineIso: string | null | undefined;
  if (isOwner && row.status === "awaiting_auction_payment") {
    const ord = await prisma.order.findUnique({
      where: { listingId: row.id },
      select: { paymentDeadlineAt: true },
    });
    auctionPaymentDeadlineIso = ord?.paymentDeadlineAt?.toISOString() ?? null;
  }
  const endRequest =
    isOwner && row.buyingFormat === "auction"
      ? await getLatestEndRequestForListing(row.id)
      : null;

  const marketplace = isDetailVisible
    ? {
        ...dbListingToMarketplace(row, bc != null ? { bidCount: bc } : undefined),
        sellerCompletedOrderCount,
      }
    : null;

  return NextResponse.json({
    marketplace,
    stored: isOwner ? dbListingToStored(row, pending, bc, { auctionPaymentDeadlineIso }) : null,
    bidCount: isOwner && row.buyingFormat === "auction" ? bc ?? 0 : undefined,
    endRequest: isOwner ? endRequest : null,
    sellerCompletedOrderCount: isDetailVisible ? sellerCompletedOrderCount : undefined,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const sellerId = auth.userId;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const existing = await prisma.listing.findFirst({
    where: { id, sellerId },
    include: { images: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.status === "layaway_reserved") {
    return NextResponse.json(
      { error: "This listing is on layaway and cannot be edited until the plan ends." },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: {
    title?: string;
    description?: string;
    category?: string;
    condition?: string;
    buyingFormat?: BuyingFormat;
    priceUsd?: number;
    startingBidUsd?: number | null;
    currentBidUsd?: number | null;
    reservePriceUsd?: number | null;
    auctionDurationDays?: number | null;
    shippingPriceUsd?: number;
    handlingTime?: string;
    signatureRequired?: boolean;
    allowOffers?: boolean;
    allowLayaway?: boolean;
    acceptTradeOffers?: boolean;
    minimumOfferUsd?: number | null;
    status?: ListingStatus;
    vaultPick?: boolean;
    workspaceKey?: string | null;
    auctionEndsAt?: Date | null;
    parcelWeightOz?: number | null;
    parcelLengthIn?: number | null;
    parcelWidthIn?: number | null;
    parcelHeightIn?: number | null;
    shippingBaseWeightOz?: number;
    shippingIncrementalWeightOz?: number;
    shippingPriceCapCents?: number | null;
    shippingCategory?: "raw_card" | "slab" | "small_collectible" | "custom";
    shipAlone?: boolean;
    shipFromAddressId?: string | null;
    marketplaceShippingOfferScope?: "all" | "no_overnight" | "custom";
    marketplaceAllowedRateKeys?: string[];
    marketplaceAllowedCarriers?: string[];
  } = {};

  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.category === "string") data.category = body.category.trim();
  if (typeof body.condition === "string") data.condition = body.condition.trim();
  if (body.buyingFormat === "buy_now" || body.buyingFormat === "auction") data.buyingFormat = body.buyingFormat;
  if (typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd)) data.priceUsd = body.priceUsd;
  if (body.startingBidUsd === null || (typeof body.startingBidUsd === "number" && Number.isFinite(body.startingBidUsd))) {
    data.startingBidUsd = body.startingBidUsd as number | null;
  }
  if (body.currentBidUsd === null || (typeof body.currentBidUsd === "number" && Number.isFinite(body.currentBidUsd))) {
    data.currentBidUsd = body.currentBidUsd as number | null;
  }
  if (body.reservePriceUsd === null || (typeof body.reservePriceUsd === "number" && Number.isFinite(body.reservePriceUsd))) {
    data.reservePriceUsd = body.reservePriceUsd as number | null;
  }
  if (body.auctionDurationDays === null || (typeof body.auctionDurationDays === "number" && Number.isFinite(body.auctionDurationDays))) {
    data.auctionDurationDays = body.auctionDurationDays === null ? null : Math.floor(body.auctionDurationDays as number);
  }
  if (typeof body.shippingPriceUsd === "number" && Number.isFinite(body.shippingPriceUsd)) data.shippingPriceUsd = body.shippingPriceUsd;
  if (typeof body.handlingTime === "string") data.handlingTime = body.handlingTime;
  if (typeof body.signatureRequired === "boolean") data.signatureRequired = body.signatureRequired;
  if (typeof body.allowOffers === "boolean") data.allowOffers = body.allowOffers;
  if (typeof body.acceptTradeOffers === "boolean") data.acceptTradeOffers = body.acceptTradeOffers;
  if (body.minimumOfferUsd === null || (typeof body.minimumOfferUsd === "number" && Number.isFinite(body.minimumOfferUsd))) {
    data.minimumOfferUsd = body.minimumOfferUsd as number | null;
  }
  if (body.allowOffers === false) data.minimumOfferUsd = null;

  if (body.status === "draft" || body.status === "active" || body.status === "sold" || body.status === "auction_live") {
    data.status = body.status;
  }
  if (typeof body.vaultPick === "boolean") data.vaultPick = body.vaultPick;

  const parseParcelPatch = (v: unknown): number | null | undefined => {
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    return undefined;
  };
  const pw = parseParcelPatch(body.parcelWeightOz);
  if (pw !== undefined) data.parcelWeightOz = pw;
  const pl = parseParcelPatch(body.parcelLengthIn);
  if (pl !== undefined) data.parcelLengthIn = pl;
  const pwi = parseParcelPatch(body.parcelWidthIn);
  if (pwi !== undefined) data.parcelWidthIn = pwi;
  const ph = parseParcelPatch(body.parcelHeightIn);
  if (ph !== undefined) data.parcelHeightIn = ph;
  const parseWeightPatch = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    return undefined;
  };
  const baseW = parseWeightPatch(body.shippingBaseWeightOz);
  if (baseW !== undefined) data.shippingBaseWeightOz = baseW;
  const incrW = parseWeightPatch(body.shippingIncrementalWeightOz);
  if (incrW !== undefined) data.shippingIncrementalWeightOz = incrW;
  if (
    body.shippingPriceCapCents === null ||
    (typeof body.shippingPriceCapCents === "number" &&
      Number.isFinite(body.shippingPriceCapCents) &&
      body.shippingPriceCapCents >= 0)
  ) {
    data.shippingPriceCapCents =
      body.shippingPriceCapCents === null ? null : Math.floor(body.shippingPriceCapCents as number);
  }
  if (
    body.shippingCategory === "raw_card" ||
    body.shippingCategory === "slab" ||
    body.shippingCategory === "small_collectible" ||
    body.shippingCategory === "custom"
  ) {
    data.shippingCategory = body.shippingCategory;
  }
  if (typeof body.shipAlone === "boolean") data.shipAlone = body.shipAlone;
  if (body.shipFromAddressId === null || typeof body.shipFromAddressId === "string") {
    const next = body.shipFromAddressId === null ? null : body.shipFromAddressId.trim();
    data.shipFromAddressId = next && next.length > 0 ? next : null;
  }
  if (body.marketplaceShippingOfferScope !== undefined) {
    data.marketplaceShippingOfferScope = parseMarketplaceShippingOfferScope(body.marketplaceShippingOfferScope);
  }
  if (body.marketplaceAllowedRateKeys !== undefined) {
    data.marketplaceAllowedRateKeys = parseMarketplaceAllowedRateKeys(body.marketplaceAllowedRateKeys).map((key) => {
      const [carrier = "", service = ""] = key.split("|");
      return marketplaceListingRateKey({ carrier, serviceLevel: service });
    });
  }
  if (body.marketplaceAllowedCarriers !== undefined) {
    data.marketplaceAllowedCarriers = parseMarketplaceAllowedCarriers(body.marketplaceAllowedCarriers);
  }

  const formatBeforeCoerce = data.buyingFormat ?? existing.buyingFormat;
  const statusBeforeCoerce = data.status ?? existing.status;

  if (
    isMarketplaceTimedAuctionPublishAttempt({
      buyingFormat: formatBeforeCoerce,
      status: statusBeforeCoerce,
    }) &&
    existing.status !== "auction_live"
  ) {
    return NextResponse.json(
      { error: MARKETPLACE_AUCTION_DISABLED_MESSAGE, code: "MARKETPLACE_AUCTION_DISABLED" },
      { status: 400 },
    );
  }

  if (body.buyingFormat === "buy_now" && existing.buyingFormat === "auction") {
    const bids = await prisma.bid.count({ where: { listingId: id } });
    if (bids > 0) {
      return NextResponse.json({ error: "Cannot switch to buy now while this auction has bids." }, { status: 400 });
    }
  }

  if (
    statusBeforeCoerce !== "draft" &&
    statusBeforeCoerce !== "sold" &&
    statusBeforeCoerce !== "awaiting_auction_payment" &&
    statusBeforeCoerce !== "auction_ended_unpaid"
  ) {
    if (formatBeforeCoerce === "auction") {
      data.status = "auction_live";
    } else if (formatBeforeCoerce === "buy_now") {
      data.status = "active";
    }
  }

  if (body.buyingFormat === "buy_now") {
    data.startingBidUsd = null;
    data.currentBidUsd = null;
    data.reservePriceUsd = null;
    data.auctionDurationDays = null;
    data.auctionEndsAt = null;
  }

  if (data.status === "active" || data.status === "auction_live") {
    data.workspaceKey = null;
  }

  const nextFormat = data.buyingFormat ?? existing.buyingFormat;
  const nextStatus = data.status ?? existing.status;
  if (
    nextFormat === "auction" &&
    (nextStatus === "auction_live" || nextStatus === "active") &&
    !existing.auctionEndsAt
  ) {
    const days = data.auctionDurationDays ?? existing.auctionDurationDays;
    data.auctionEndsAt = computeAuctionEndsAt(new Date(), days ?? undefined);
  }

  const listedUrls = Array.isArray(body.images)
    ? body.images.filter((x): x is string => typeof x === "string")
    : null;

  const bidCount = await prisma.bid.count({ where: { listingId: id } });
  if (bidCount > 0) {
    delete data.currentBidUsd;
    if (listedUrls !== null) {
      return NextResponse.json({ error: "Cannot change photos after bids have been placed." }, { status: 400 });
    }
    if (data.buyingFormat !== undefined && data.buyingFormat !== existing.buyingFormat) {
      return NextResponse.json({ error: "Cannot change buying format after bids have been placed." }, { status: 400 });
    }
    if (data.startingBidUsd !== undefined) {
      const prev = existing.startingBidUsd ?? existing.priceUsd;
      const next = data.startingBidUsd;
      if (next == null || !Number.isFinite(next) || Math.abs(next - prev) > 0.0001) {
        return NextResponse.json({ error: "Cannot change starting bid after bids have been placed." }, { status: 400 });
      }
    }
    if (data.reservePriceUsd !== undefined) {
      const a = existing.reservePriceUsd;
      const b = data.reservePriceUsd;
      const changed =
        (a == null) !== (b == null) || (a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 0.0001);
      if (changed) {
        return NextResponse.json({ error: "Cannot change reserve price after bids have been placed." }, { status: 400 });
      }
    }
    if (data.auctionDurationDays !== undefined && data.auctionDurationDays !== existing.auctionDurationDays) {
      return NextResponse.json({ error: "Cannot change auction duration after bids have been placed." }, { status: 400 });
    }
    if (typeof body.priceUsd === "number" && existing.buyingFormat === "auction" && Math.abs(body.priceUsd - existing.priceUsd) > 0.0001) {
      return NextResponse.json({ error: "Cannot change auction price fields after bids have been placed." }, { status: 400 });
    }
  }

  if (nextFormat === "auction" && (nextStatus === "auction_live" || nextStatus === "active")) {
    const mergedStart = (data.startingBidUsd ?? existing.startingBidUsd ?? data.priceUsd ?? existing.priceUsd) as number;
    if (!Number.isFinite(mergedStart) || mergedStart <= 0) {
      return NextResponse.json({ error: "A valid starting bid is required for a live auction." }, { status: 400 });
    }
    const mergedDays = data.auctionDurationDays ?? existing.auctionDurationDays;
    if (mergedDays == null || mergedDays < 1 || mergedDays > 365) {
      return NextResponse.json({ error: "Auction duration (1–365 days) is required for a live auction." }, { status: 400 });
    }
    const mergedEnds = data.auctionEndsAt ?? existing.auctionEndsAt;
    if (!mergedEnds || mergedEnds.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "This auction has ended or is missing an end time. Refresh the page." },
        { status: 409 },
      );
    }
  }

  const imageCountAfter = listedUrls !== null ? listedUrls.length : existing.images.length;
  const imageValidation = validateListingImageCount({
    buyingFormat: nextFormat,
    status: nextStatus,
    imageCount: imageCountAfter,
  });
  if (!imageValidation.ok) {
    return NextResponse.json({ error: imageValidation.error }, { status: 400 });
  }
  if ((nextStatus === "active" || nextStatus === "auction_live") && imageCountAfter === 0) {
    return NextResponse.json({ error: "At least one image is required to publish." }, { status: 400 });
  }

  const effectiveNextStatus = data.status !== undefined ? data.status : existing.status;
  const wasPublished = existing.status === "active" || existing.status === "auction_live";
  const willBePublished = effectiveNextStatus === "active" || effectiveNextStatus === "auction_live";
  const mergedParcel = {
    parcelWeightOz: data.parcelWeightOz !== undefined ? data.parcelWeightOz : existing.parcelWeightOz,
    parcelLengthIn: data.parcelLengthIn !== undefined ? data.parcelLengthIn : existing.parcelLengthIn,
    parcelWidthIn: data.parcelWidthIn !== undefined ? data.parcelWidthIn : existing.parcelWidthIn,
    parcelHeightIn: data.parcelHeightIn !== undefined ? data.parcelHeightIn : existing.parcelHeightIn,
  };
  if (willBePublished && !hasCompleteParcel(mergedParcel)) {
    return NextResponse.json(
      {
        error: "Add parcel weight (oz) and length, width, and height (inches) before publishing — required for shipping labels.",
        code: "PARCEL_REQUIRED",
      },
      { status: 400 },
    );
  }
  const mergedShippingPrice =
    data.shippingPriceUsd !== undefined ? data.shippingPriceUsd : existing.shippingPriceUsd;
  const mergedAllowedCarriers =
    data.marketplaceAllowedCarriers !== undefined
      ? data.marketplaceAllowedCarriers
      : existing.marketplaceAllowedCarriers;
  if (willBePublished && mergedShippingPrice <= 0 && mergedAllowedCarriers.length === 0) {
    return NextResponse.json(
      {
        error: "Select at least one shipping carrier buyers can use at checkout.",
        code: "SHIPPING_CARRIERS_REQUIRED",
      },
      { status: 400 },
    );
  }
  if (willBePublished && !wasPublished) {
    const mergedShipFromAddressId =
      data.shipFromAddressId !== undefined ? data.shipFromAddressId : existing.shipFromAddressId;
    if (mergedShipFromAddressId) {
      const owned = await prisma.address.findFirst({
        where: {
          id: mergedShipFromAddressId,
          userId: sellerId,
          type: "ship_from",
        },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Select a valid ship-from address before publishing." }, { status: 400 });
      }
    }
    try {
      await assertSellerCanPublishListing(prisma, sellerId, {
        shippingBaseWeightOz: data.shippingBaseWeightOz ?? existing.shippingBaseWeightOz,
        shippingIncrementalWeightOz: data.shippingIncrementalWeightOz ?? existing.shippingIncrementalWeightOz,
        shippingCategory: data.shippingCategory ?? existing.shippingCategory,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "SELLER_REQUIREMENTS_INCOMPLETE") {
        const issues = (e as Error & { issues?: string[] }).issues ?? [];
        return NextResponse.json(
          {
            error: "Complete seller setup before publishing.",
            code: "SELLER_REQUIREMENTS_INCOMPLETE",
            issues,
          },
          { status: 403 },
        );
      }
      console.error("[PATCH /api/listings/[id]] seller readiness check failed", e);
      return NextResponse.json(
        { error: "Could not verify seller readiness.", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  const mergedPrice = data.priceUsd ?? existing.priceUsd;
  const mergedFormat = data.buyingFormat ?? existing.buyingFormat;
  if (typeof body.allowLayaway === "boolean") {
    data.allowLayaway =
      mergedFormat === "buy_now"
        ? resolveAllowLayawayForListing({ allowLayaway: body.allowLayaway, priceUsd: mergedPrice })
        : false;
  } else if (mergedPrice < LAYAWAY_MIN_LISTING_PRICE_USD) {
    data.allowLayaway = false;
  } else if (mergedFormat !== "buy_now") {
    data.allowLayaway = false;
  }

  await prisma.listing.update({
    where: { id },
    data,
  });

  if (listedUrls !== null) {
    await replaceListingImages(id, listedUrls);
  }

  const full = await prisma.listing.findUniqueOrThrow({ where: { id }, include: listingInclude });
  maybeEmitMarketplaceCatalogChanged({
    before: { status: existing.status, moderationRemovedAt: existing.moderationRemovedAt },
    after: { status: full.status, moderationRemovedAt: full.moderationRemovedAt },
    listingId: full.id,
    sellerId: full.sellerId,
    reason:
      full.status === "sold"
        ? "sold"
        : full.status === "active" || full.status === "auction_live"
          ? "published"
          : "updated",
  });
  const pending = await prisma.offer.count({ where: { listingId: id, status: "pending" } });
  const bc =
    full.buyingFormat === "auction" ? await prisma.bid.count({ where: { listingId: id } }) : undefined;
  return NextResponse.json({ listing: dbListingToStored(full, pending, bc) });
}

const LISTING_HAS_DEPENDENCIES_ERROR = {
  error:
    "This listing can't be deleted because it has existing orders or trade offers. Consider ending or delisting it instead.",
  code: "LISTING_HAS_DEPENDENCIES",
} as const;

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const sellerId = auth.userId;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const existing = await prisma.listing.findFirst({ where: { id, sellerId }, select: { id: true, status: true, moderationRemovedAt: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [tradeOfferItemCount, orderCount] = await Promise.all([
    prisma.tradeOfferItem.count({ where: { listingId: id } }),
    prisma.order.count({ where: { listingId: id } }),
  ]);
  if (tradeOfferItemCount > 0 || orderCount > 0) {
    return NextResponse.json(LISTING_HAS_DEPENDENCIES_ERROR, { status: 409 });
  }

  try {
    const res = await prisma.listing.deleteMany({ where: { id, sellerId } });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    maybeEmitMarketplaceCatalogChanged({
      before: { status: existing.status, moderationRemovedAt: existing.moderationRemovedAt },
      after: { status: "ended", moderationRemovedAt: existing.moderationRemovedAt },
      listingId: existing.id,
      sellerId,
      reason: "deleted",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Belt-and-suspenders: TradeOfferItem/Order use onDelete: Restrict, so a race with the
    // pre-check above (or any other Restrict relation) still surfaces as a clean 409 instead of a 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2014")) {
      return NextResponse.json(LISTING_HAS_DEPENDENCIES_ERROR, { status: 409 });
    }
    console.error("[DELETE /api/listings/[id]] delete failed", e);
    return NextResponse.json({ error: "Could not delete this listing." }, { status: 500 });
  }
}
