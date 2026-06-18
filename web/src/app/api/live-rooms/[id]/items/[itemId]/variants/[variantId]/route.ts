import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";

type PatchBody = { isHot?: boolean; sortOrder?: number; priceUsd?: number };

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string; variantId: string }> },
) {
  const { id: rawRoom, itemId, variantId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { isHot?: boolean; sortOrder?: number; priceUsd?: number } = {};
  if (typeof body.isHot === "boolean") data.isHot = body.isHot;
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.floor(body.sortOrder);
  }
  if (typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) && body.priceUsd >= 0) {
    data.priceUsd = Math.round(body.priceUsd * 100) / 100;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes." }, { status: 400 });
  }

  const variant = await prisma.liveItemVariant.findFirst({
    where: { id: variantId, liveRoomItemId: itemId, liveRoomItem: { liveRoomId } },
    select: { id: true, quantityRemaining: true, status: true, liveRoomItem: { select: { status: true } } },
  });
  if (!variant) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }
  if (variant.liveRoomItem.status === "sold") {
    return NextResponse.json({ error: "This break item is already sold." }, { status: 409 });
  }
  if ("priceUsd" in data) {
    if (variant.quantityRemaining <= 0 || variant.status === "sold_out") {
      return NextResponse.json({ error: "Cannot change price on a sold spot." }, { status: 409 });
    }
  }

  const updated = await prisma.liveItemVariant.updateMany({
    where: { id: variantId, liveRoomItemId: itemId, liveRoomItem: { liveRoomId } },
    data,
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }

  await prisma.liveRoomItem.update({
    where: { id: itemId },
    data: { itemVersion: { increment: 1 } },
  });

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({ ok: true });
}
