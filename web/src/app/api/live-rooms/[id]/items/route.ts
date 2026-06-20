import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { isVariantSalesFormat, normalizeVariantDrafts } from "@/lib/live-item-variant-presets";
import { parseLiveItemSalesFormat } from "@/lib/live-item-variant-serialize";
import type { LiveItemVariantAssignmentMode } from "@/generated/prisma/client";
import { validateLiveRoomItemThumbnail } from "@/lib/listing-photo-requirements";
import { apiErrorResponseFromUnknown } from "@/lib/prisma-api-error-response";

type PostBody = {
  title?: string;
  listingId?: string | null;
  imageUrl?: string;
  priceUsd?: number | null;
  startingBidUsd?: number | null;
  bidIncrementUsd?: number | null;
  reservePriceUsd?: number | null;
  sortOrder?: number;
  teamBoardMisc?: boolean;
  /** Units on this single queue row (one tile). Max 512. */
  quantity?: number | string;
  salesFormat?: string;
  variants?: unknown;
  variantAssignmentMode?: string;
  shippingProfileId?: string | null;
};

function clampItemQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(512, Math.max(1, Math.floor(n)));
}

function parseQuantity(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return clampItemQuantity(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return clampItemQuantity(n);
  }
  return 1;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { userId, isAdmin, room } = hostAuth;
  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended. You cannot add queue items." }, { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  const quantity = parseQuantity(body.quantity);

  const listingId = typeof body.listingId === "string" && body.listingId.trim() ? body.listingId.trim() : null;
  if (listingId && !isAdmin) {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId },
      select: { id: true },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found for this seller." }, { status: 400 });
  }
  if (listingId && isAdmin) {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, sellerId: room.sellerId },
      select: { id: true },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found for this room's seller." }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim().slice(0, 2000) : "";
  const thumbValidation = validateLiveRoomItemThumbnail(imageUrl);
  if (!thumbValidation.ok) {
    return NextResponse.json({ error: thumbValidation.error }, { status: 400 });
  }
  const priceUsd = typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) ? body.priceUsd : null;
  const startingBidUsd =
    typeof body.startingBidUsd === "number" && Number.isFinite(body.startingBidUsd) ? body.startingBidUsd : null;
  /** Bid increments are system-controlled; hosts cannot set them on create. */
  const bidIncrementUsd = null;
  const reservePriceUsd =
    typeof body.reservePriceUsd === "number" && Number.isFinite(body.reservePriceUsd) && body.reservePriceUsd > 0
      ? body.reservePriceUsd
      : null;

  const maxSort = await prisma.liveRoomItem.aggregate({
    where: { liveRoomId },
    _max: { sortOrder: true },
  });
  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : (maxSort._max.sortOrder ?? -1) + 1;

  const startingBidFinal =
    typeof startingBidUsd === "number" && Number.isFinite(startingBidUsd) && startingBidUsd > 0
      ? startingBidUsd
      : 1;
  const currentBidUsd = null;

  const teamBoardMisc =
    body.teamBoardMisc === true && room.roomType === "break" && room.teamBoardLeague === "nfl";

  const salesFormat = parseLiveItemSalesFormat(body.salesFormat);
  const variantAssignmentMode: LiveItemVariantAssignmentMode =
    body.variantAssignmentMode === "random" && isVariantSalesFormat(salesFormat) ? "random" : "pick";
  const variantDrafts = isVariantSalesFormat(salesFormat) ? normalizeVariantDrafts(body.variants) : [];
  if (isVariantSalesFormat(salesFormat) && variantDrafts.length === 0) {
    return NextResponse.json({ error: "Add at least one selectable option for variant items." }, { status: 400 });
  }

  const explicitProfileId =
    typeof body.shippingProfileId === "string" && body.shippingProfileId.trim()
      ? body.shippingProfileId.trim()
      : null;
  const inheritedProfile = await resolveDefaultProfileForLiveShow({
    showDefaultProfileId: room.defaultShippingProfileId,
    category: room.category,
    db: prisma,
  });
  const resolvedProfile = explicitProfileId
    ? await prisma.platformShippingProfile.findFirst({
        where: { id: explicitProfileId, isActive: true },
      })
    : inheritedProfile;
  if (explicitProfileId && !resolvedProfile) {
    return NextResponse.json({ error: "That shipping profile is not available." }, { status: 400 });
  }

  const baseCreate = {
    liveRoomId,
    listingId,
    title: title.slice(0, 300),
    imageUrl,
    priceUsd: isVariantSalesFormat(salesFormat) ? (variantDrafts[0]?.priceUsd ?? priceUsd) : priceUsd,
    startingBidUsd: startingBidFinal,
    bidIncrementUsd,
    reservePriceUsd,
    currentBidUsd,
    status: "queued" as const,
    sortOrder,
    teamBoardMisc,
    quantity: isVariantSalesFormat(salesFormat) ? 1 : quantity,
    quantityInitial: isVariantSalesFormat(salesFormat) ? 1 : quantity,
    salesFormat,
    variantAssignmentMode,
    shippingProfileId: resolvedProfile?.id ?? null,
    requiresSeparatePackage: resolvedProfile?.requiresSeparatePackage ?? null,
  };

  /** Turbopack / dev can keep an older bundled Prisma client that rejects newer fields even after `prisma generate`. */
  function isStaleClientUnknownFieldArg(e: unknown, field: string): boolean {
    if (!(e instanceof Error)) return false;
    if (e.name !== "PrismaClientValidationError") return false;
    return new RegExp(`Unknown argument [\`'"]?${field}[\`'"]?`, "i").test(e.message);
  }

  function isMissingSchemaColumnError(e: unknown): boolean {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2022") return true;
      const meta = e.meta as { column_name?: unknown } | undefined;
      const col = typeof meta?.column_name === "string" ? meta.column_name : "";
      if (col.includes("quantity") || col.includes("variantAssignmentMode") || col.includes("revealedLabel")) {
        return true;
      }
      const msg = `${e.message}\n${JSON.stringify(e.meta ?? {})}`;
      if (e.code === "P2010" && /(42703|does not exist|ColumnNotFound)/i.test(msg)) return true;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /column\s+[`"']?(quantity|variantAssignmentMode|revealedLabel)[`"']?\s+of relation/i.test(msg) ||
      (/42703/.test(msg) && /(quantity|variantAssignmentMode|revealedLabel)/i.test(msg))
    );
  }

  let item: { id: string };
  try {
    item = await prisma.$transaction(async (tx) => {
      const created = await tx.liveRoomItem.create({
        data: { ...baseCreate, quantity: baseCreate.quantity },
        select: { id: true },
      });
      if (variantDrafts.length > 0) {
        await tx.liveItemVariant.createMany({
          data: variantDrafts.map((v, i) => ({
            liveRoomItemId: created.id,
            label: v.label,
            priceUsd: v.priceUsd,
            quantityInitial: v.quantityInitial ?? 1,
            quantityRemaining: v.quantityInitial ?? 1,
            isHot: v.isHot === true,
            imageUrl: v.imageUrl ?? "",
            color: v.color ?? "",
            sortOrder: v.sortOrder ?? i,
          })),
        });
      }
      return created;
    });
  } catch (e) {
    if (isStaleClientUnknownFieldArg(e, "quantity")) {
      try {
        item = await prisma.liveRoomItem.create({
          data: baseCreate,
          select: { id: true },
        });
        try {
          await prisma.$executeRaw(
            Prisma.sql`UPDATE "LiveRoomItem" SET "quantity" = ${quantity} WHERE "id" = ${item.id}`,
          );
        } catch (rawErr) {
          console.error("[live-room items POST] quantity UPDATE failed (stale-client fallback)", rawErr);
          await prisma.liveRoomItem.delete({ where: { id: item.id } }).catch(() => {});
          if (isMissingSchemaColumnError(rawErr)) {
            return apiErrorResponseFromUnknown(rawErr, {
              error: "Database is out of date for queue items.",
              code: "LIVE_ITEM_SCHEMA_OUT_OF_DATE",
            });
          }
          return NextResponse.json(
            {
              error:
                "Could not set queue item quantity. Run `npx prisma migrate deploy`, then stop and restart `npm run dev` (or run `npm run db:generate:clean`).",
            },
            { status: 503 },
          );
        }
      } catch (e2) {
        console.error("[live-room items POST] create failed (stale-client fallback)", e2);
        if (isMissingSchemaColumnError(e2)) {
          return apiErrorResponseFromUnknown(e2, {
            error: "Database is out of date for queue items.",
            code: "LIVE_ITEM_SCHEMA_OUT_OF_DATE",
          });
        }
        return NextResponse.json({ error: "Could not create queue item." }, { status: 500 });
      }
    } else if (isStaleClientUnknownFieldArg(e, "variantAssignmentMode")) {
      try {
        const { variantAssignmentMode: _omit, ...createWithoutMode } = baseCreate;
        item = await prisma.liveRoomItem.create({
          data: createWithoutMode,
          select: { id: true },
        });
        if (variantDrafts.length > 0) {
          await prisma.liveItemVariant.createMany({
            data: variantDrafts.map((v, i) => ({
              liveRoomItemId: item.id,
              label: v.label,
              priceUsd: v.priceUsd,
              quantityInitial: v.quantityInitial ?? 1,
              quantityRemaining: v.quantityInitial ?? 1,
              isHot: v.isHot === true,
              imageUrl: v.imageUrl ?? "",
              color: v.color ?? "",
              sortOrder: v.sortOrder ?? i,
            })),
          });
        }
      } catch (e2) {
        console.error("[live-room items POST] create failed (variantAssignmentMode fallback)", e2);
        if (isMissingSchemaColumnError(e2)) {
          return apiErrorResponseFromUnknown(e2, {
            error: "Database is out of date for queue items.",
            code: "LIVE_ITEM_SCHEMA_OUT_OF_DATE",
          });
        }
        return NextResponse.json({ error: "Could not create queue item." }, { status: 500 });
      }
    } else {
      console.error("[live-room items POST] create failed", e);
      if (isMissingSchemaColumnError(e)) {
        return apiErrorResponseFromUnknown(e, {
          error: "Database is out of date for queue items.",
          code: "LIVE_ITEM_SCHEMA_OUT_OF_DATE",
        });
      }
      const msg = e instanceof Error ? e.message : "";
      if (/quantity|variantAssignmentMode|Unknown argument/i.test(msg)) {
        return apiErrorResponseFromUnknown(e, {
          error: "Queue item storage failed. Apply the latest Prisma migrations, then try again.",
          code: "LIVE_ITEM_SCHEMA_OUT_OF_DATE",
        });
      }
      return NextResponse.json({ error: "Could not create queue item." }, { status: 500 });
    }
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({ id: item.id });
}
