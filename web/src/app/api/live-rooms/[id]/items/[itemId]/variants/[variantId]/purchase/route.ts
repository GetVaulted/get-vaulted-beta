import { NextResponse } from "next/server";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import { createLiveItemVariantCheckoutSession, finalizeLiveItemVariantPurchasePaid } from "@/lib/live-item-variant-purchase";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

type Body = { quantity?: unknown };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string; variantId: string }> },
) {
  const { id: rawRoom, itemId, variantId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const returnPath = `/live/${encodeURIComponent(liveRoomId)}`;

  const authHeader = req.headers.get("authorization");
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Sign in to checkout.", signInUrl: signInUrl(returnPath) }, { status: 401 });
    }
    return auth;
  }
  const userId = auth.userId;

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, status: true, lockPurchases: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  if (room.lockPurchases) {
    return NextResponse.json({ error: "Purchases are locked for this room." }, { status: 409 });
  }

  if (room.sellerId === userId) {
    return NextResponse.json({ error: "You cannot purchase in your own room." }, { status: 400 });
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(userId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body ok */
  }

  const qtyRaw = body.quantity;
  const quantity =
    typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(99, Math.floor(qtyRaw)) : 1;

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 128) ?? null;
  if (idempotencyKey) {
    const existing = await prisma.liveItemVariantPurchase.findFirst({
      where: { idempotencyKey, buyerId: userId },
      select: { id: true, paymentStatus: true, stripeCheckoutSessionId: true, totalUsd: true },
    });
    if (existing) {
      if (existing.paymentStatus === "paid") {
        return NextResponse.json({ purchaseId: existing.id, paid: true });
      }
      if (existing.totalUsd > 0 && isStripeConfigured()) {
        try {
          const { url } = await createLiveItemVariantCheckoutSession({
            userId,
            purchaseId: existing.id,
          });
          return NextResponse.json({ purchaseId: existing.id, checkoutUrl: url });
        } catch {
          /* fall through to retry reserve */
        }
      }
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.liveItemVariant.findFirst({
        where: { id: variantId, liveRoomItem: { id: itemId, liveRoomId } },
        include: {
          liveRoomItem: {
            select: {
              id: true,
              status: true,
              salesFormat: true,
              title: true,
            },
          },
        },
      });
      if (!variant) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      const item = variant.liveRoomItem;
      if (!isVariantSalesFormat(item.salesFormat)) {
        throw Object.assign(new Error("NOT_VARIANT_ITEM"), { code: "NOT_VARIANT_ITEM" });
      }
      if (item.status !== "active" && item.status !== "queued") {
        throw Object.assign(new Error("ITEM_UNAVAILABLE"), { code: "ITEM_UNAVAILABLE" });
      }

      const updated = await tx.liveItemVariant.updateMany({
        where: { id: variantId, quantityRemaining: { gte: quantity } },
        data: {
          quantityRemaining: { decrement: quantity },
          soldCount: { increment: quantity },
        },
      });
      if (updated.count === 0) {
        throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
      }

      const unitPriceUsd = variant.priceUsd;
      const totalUsd = Math.round(unitPriceUsd * quantity * 100) / 100;

      const purchase = await tx.liveItemVariantPurchase.create({
        data: {
          liveRoomId,
          liveRoomItemId: item.id,
          variantId: variant.id,
          buyerId: userId,
          quantity,
          unitPriceUsd,
          totalUsd,
          paymentStatus: totalUsd <= 0 ? "paid" : "pending_payment",
          idempotencyKey: idempotencyKey ?? undefined,
          paidAt: totalUsd <= 0 ? new Date() : undefined,
        },
        select: { id: true, totalUsd: true },
      });

      const remaining = await tx.liveItemVariant.findUnique({
        where: { id: variantId },
        select: { quantityRemaining: true },
      });
      if (remaining && remaining.quantityRemaining <= 0) {
        await tx.liveItemVariant.update({
          where: { id: variantId },
          data: { status: "sold_out" },
        });
      }

      await tx.liveRoomItem.update({
        where: { id: item.id },
        data: { itemVersion: { increment: 1 } },
      });

      return purchase;
    });

    if (result.totalUsd <= 0 || !isStripeConfigured()) {
      await finalizeLiveItemVariantPurchasePaid(result.id);
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({ purchaseId: result.id, paid: true });
    }

    const { url } = await createLiveItemVariantCheckoutSession({
      userId,
      purchaseId: result.id,
    });
    emitLiveRoomQueueItemsChanged(liveRoomId);
    return NextResponse.json({ purchaseId: result.id, checkoutUrl: url });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Option not found." }, { status: 404 });
    if (code === "NOT_VARIANT_ITEM") return NextResponse.json({ error: "This item does not support spot selection." }, { status: 400 });
    if (code === "ITEM_UNAVAILABLE") return NextResponse.json({ error: "This item is not available." }, { status: 409 });
    if (code === "SOLD_OUT") return NextResponse.json({ error: "That option is sold out." }, { status: 409 });
    console.error("[variant purchase POST]", e);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
