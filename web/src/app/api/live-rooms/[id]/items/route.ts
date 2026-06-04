import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { isVariantSalesFormat, normalizeVariantDrafts } from "@/lib/live-item-variant-presets";
import { parseLiveItemSalesFormat } from "@/lib/live-item-variant-serialize";

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
  const variantDrafts = isVariantSalesFormat(salesFormat) ? normalizeVariantDrafts(body.variants) : [];
  if (isVariantSalesFormat(salesFormat) && variantDrafts.length === 0) {
    return NextResponse.json({ error: "Add at least one selectable option for variant items." }, { status: 400 });
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
  };

  /** Turbopack / dev can keep an older bundled Prisma client that rejects `quantity` even after `prisma generate`. */
  function isStaleClientUnknownQuantityArg(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    if (e.name !== "PrismaClientValidationError") return false;
    return /Unknown argument [`'"]?quantity[`'"]?/i.test(e.message);
  }

  /** Postgres 42703 / adapter "ColumnNotFound" on raw SQL — meta shape differs from P2022. */
  function isMissingQuantityColumnError(e: unknown): boolean {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2022") return true;
      const msg = `${e.message}\n${JSON.stringify(e.meta ?? {})}`;
      if (e.code === "P2010" && /quantity/i.test(msg) && /(42703|does not exist|ColumnNotFound)/i.test(msg)) {
        return true;
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /column\s+[`"']?quantity[`"']?\s+of relation\s+[`"']?LiveRoomItem[`"']?\s+does not exist/i.test(msg) ||
      (/42703/.test(msg) && /quantity/i.test(msg))
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
    if (isStaleClientUnknownQuantityArg(e)) {
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
          if (isMissingQuantityColumnError(rawErr)) {
            return NextResponse.json(
              {
                error:
                  "Database is out of date: the LiveRoomItem.quantity column is missing. From the project root run `npx prisma migrate deploy` (or `npm run db:migrate:deploy`) against this database, then add the item again.",
              },
              { status: 503 },
            );
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
        if (e2 instanceof Prisma.PrismaClientKnownRequestError) {
          const meta = e2.meta as { column_name?: unknown } | undefined;
          const col = typeof meta?.column_name === "string" ? meta.column_name : "";
          if (e2.code === "P2022" || col.includes("quantity")) {
            return NextResponse.json(
              {
                error:
                  "Database is out of date: the LiveRoomItem.quantity column is missing. Run `npx prisma migrate deploy` (or `npx prisma migrate dev`) against this environment.",
              },
              { status: 503 },
            );
          }
        }
        return NextResponse.json({ error: "Could not create queue item." }, { status: 500 });
      }
    } else {
      console.error("[live-room items POST] create failed", e);
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const meta = e.meta as { column_name?: unknown } | undefined;
        const col = typeof meta?.column_name === "string" ? meta.column_name : "";
        if (e.code === "P2022" || col.includes("quantity")) {
          return NextResponse.json(
            {
              error:
                "Database is out of date: the LiveRoomItem.quantity column is missing. Run `npx prisma migrate deploy` (or `npx prisma migrate dev`) against this environment.",
            },
            { status: 503 },
          );
        }
      }
      const msg = e instanceof Error ? e.message : "";
      if (/quantity|Unknown argument/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "Queue item storage failed (quantity field). Apply the latest Prisma migrations, then try again.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "Could not create queue item." }, { status: 500 });
    }
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({ id: item.id });
}
