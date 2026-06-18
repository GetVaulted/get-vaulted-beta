import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { isVariantSalesFormat, normalizeVariantDrafts } from "@/lib/live-item-variant-presets";
import { getLiveRoomItemSnapshotDto } from "@/lib/live-room-item-snapshot-server";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";

type PostBody = {
  variants?: unknown;
  /** Convenience shape for host “Add supplemental” from the active division item. */
  supplemental?: {
    name?: string;
    priceUsd?: number;
    spotCount?: number;
    /** Display-only parent label (stored in variant label prefix). */
    feedsIntoTitle?: string;
  };
};

function buildSupplementalVariantDrafts(args: {
  name: string;
  priceUsd: number;
  spotCount: number;
  feedsIntoTitle: string | null;
  sortStart: number;
}): { label: string; priceUsd: number; quantityInitial: number; sortOrder: number }[] {
  const base = args.name.trim().slice(0, 80);
  const parentNote = args.feedsIntoTitle?.trim().slice(0, 60);
  const prefix = parentNote ? `${base} · ${parentNote}` : base;
  const count = Math.min(64, Math.max(1, Math.floor(args.spotCount)));
  if (count === 1) {
    return [{ label: prefix.slice(0, 120), priceUsd: args.priceUsd, quantityInitial: 1, sortOrder: args.sortStart }];
  }
  return Array.from({ length: count }, (_, i) => ({
    label: `${prefix} #${i + 1}`.slice(0, 120),
    priceUsd: args.priceUsd,
    quantityInitial: 1,
    sortOrder: args.sortStart + i,
  }));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: rawRoom, itemId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  if (hostAuth.room.status === "ended") {
    return NextResponse.json({ error: "This room has ended." }, { status: 409 });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: { id: true, title: true, salesFormat: true, status: true, variants: { select: { label: true, sortOrder: true } } },
  });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (!isVariantSalesFormat(item.salesFormat)) {
    return NextResponse.json({ error: "Supplementals can only be added to division/spot-sale items." }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existingLabels = new Set(item.variants.map((v) => v.label.toLowerCase()));
  const maxSort = item.variants.reduce((m, v) => Math.max(m, v.sortOrder), -1);

  let drafts = normalizeVariantDrafts(body.variants);
  if (drafts.length === 0 && body.supplemental) {
    const name = typeof body.supplemental.name === "string" ? body.supplemental.name.trim() : "";
    const priceUsd =
      typeof body.supplemental.priceUsd === "number" && Number.isFinite(body.supplemental.priceUsd)
        ? Math.max(0, body.supplemental.priceUsd)
        : NaN;
    const spotCount =
      typeof body.supplemental.spotCount === "number" && Number.isFinite(body.supplemental.spotCount)
        ? body.supplemental.spotCount
        : 1;
    const feedsIntoTitle =
      typeof body.supplemental.feedsIntoTitle === "string" ? body.supplemental.feedsIntoTitle.trim() : item.title;
    if (!name) return NextResponse.json({ error: "Supplemental name is required." }, { status: 400 });
    if (!Number.isFinite(priceUsd)) return NextResponse.json({ error: "Price per spot is required." }, { status: 400 });
    drafts = buildSupplementalVariantDrafts({
      name,
      priceUsd,
      spotCount,
      feedsIntoTitle,
      sortStart: maxSort + 1,
    });
  }

  if (drafts.length === 0) {
    return NextResponse.json({ error: "Add at least one spot/division." }, { status: 400 });
  }

  const toCreate: { label: string; priceUsd: number; quantityInitial: number; sortOrder: number }[] = [];
  for (const d of drafts) {
    let label = d.label.trim().slice(0, 120);
    if (!label) continue;
    let n = 0;
    while (existingLabels.has(label.toLowerCase())) {
      n += 1;
      label = `${d.label.trim().slice(0, 100)} (${n})`.slice(0, 120);
    }
    existingLabels.add(label.toLowerCase());
    toCreate.push({
      label,
      priceUsd: d.priceUsd,
      quantityInitial: d.quantityInitial ?? 1,
      sortOrder: d.sortOrder ?? maxSort + 1 + toCreate.length,
    });
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ error: "No valid spots to add." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of toCreate) {
      await tx.liveItemVariant.create({
        data: {
          liveRoomItemId: itemId,
          label: row.label,
          priceUsd: row.priceUsd,
          quantityInitial: row.quantityInitial,
          quantityRemaining: row.quantityInitial,
          sortOrder: row.sortOrder,
        },
      });
    }
    await tx.liveRoomItem.update({
      where: { id: itemId },
      data: { itemVersion: { increment: 1 } },
    });
    await tx.liveRoom.update({
      where: { id: liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
  });

  emitLiveRoomQueueItemsChanged(liveRoomId);
  const itemDto = await getLiveRoomItemSnapshotDto(itemId);
  return NextResponse.json({ ok: true, added: toCreate.length, item: itemDto });
}

type BulkPatchBody = {
  updates?: Array<{ id?: string; priceUsd?: number; isHot?: boolean }>;
};

/** Host batch update spot prices and pins on an existing break item. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: rawRoom, itemId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  if (hostAuth.room.status === "ended") {
    return NextResponse.json({ error: "This room has ended." }, { status: 409 });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: { id: true, status: true, salesFormat: true },
  });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (!isVariantSalesFormat(item.salesFormat)) {
    return NextResponse.json({ error: "This item is not a spot-sale break." }, { status: 400 });
  }
  if (item.status === "sold") {
    return NextResponse.json({ error: "This break item is already sold." }, { status: 409 });
  }

  let body: BulkPatchBody;
  try {
    body = (await req.json()) as BulkPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  const variantRows = await prisma.liveItemVariant.findMany({
    where: { liveRoomItemId: itemId },
    select: { id: true, quantityRemaining: true, status: true },
  });
  const byId = new Map(variantRows.map((v) => [v.id, v]));
  let changed = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of updates) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) continue;
      const existing = byId.get(id);
      if (!existing) continue;

      const data: { priceUsd?: number; isHot?: boolean } = {};
      if (typeof row.isHot === "boolean") data.isHot = row.isHot;
      if (typeof row.priceUsd === "number" && Number.isFinite(row.priceUsd) && row.priceUsd >= 0) {
        if (existing.quantityRemaining <= 0 || existing.status === "sold_out") continue;
        data.priceUsd = Math.round(row.priceUsd * 100) / 100;
      }
      if (Object.keys(data).length === 0) continue;

      const u = await tx.liveItemVariant.updateMany({
        where: { id, liveRoomItemId: itemId },
        data,
      });
      changed += u.count;
    }
    if (changed > 0) {
      await tx.liveRoomItem.update({
        where: { id: itemId },
        data: { itemVersion: { increment: 1 } },
      });
      await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
      });
    }
  });

  if (changed === 0) {
    return NextResponse.json({ error: "No valid spot updates." }, { status: 400 });
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  const itemDto = await getLiveRoomItemSnapshotDto(itemId);
  return NextResponse.json({ ok: true, updated: changed, item: itemDto });
}
