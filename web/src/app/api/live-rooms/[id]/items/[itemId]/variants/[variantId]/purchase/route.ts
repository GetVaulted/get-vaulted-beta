import { NextResponse } from "next/server";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import { finalizeLiveItemVariantPurchasePaid, releaseVariantPurchaseOnCheckoutExpired, reopenVariantPurchaseForRecovery } from "@/lib/live-item-variant-purchase";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import {
  getLiveBuyerPaymentSessionState,
  settleLiveItemVariantPurchase,
  syncLiveItemVariantPurchasePaymentIntent,
} from "@/lib/live-payment-pipeline";
import { prisma } from "@/lib/prisma";
import { getLiveBuyerCommerceBlock } from "@/lib/live-room-commerce-guards";
import { getUnresolvedPaymentFailureForBuyer, liveRoomPaymentBlockResponse } from "@/lib/live-room-payment-failure";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { isBetaDeployment } from "@/lib/is-beta-deployment";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

function stripePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
}

function checkoutFailureDebug(code: string | undefined, fulfillmentDetail?: string | null) {
  if (!isBetaDeployment() || !code) return {};
  return {
    checkoutDebug: {
      code,
      fulfillmentDetail: fulfillmentDetail?.trim() || null,
    },
  };
}

type Body = {
  quantity?: unknown;
  paymentMethodId?: unknown;
  action?: unknown;
  purchaseId?: unknown;
};

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

  const paymentBlock = await liveRoomPaymentBlockResponse(liveRoomId, userId);
  if (paymentBlock) return paymentBlock;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body ok */
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action === "sync") {
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId.trim() : "";
    if (!purchaseId) {
      return NextResponse.json({ error: "purchaseId is required." }, { status: 400 });
    }
    const sync = await syncLiveItemVariantPurchasePaymentIntent({ buyerId: userId, purchaseId });
    if (sync.outcome === "paid") {
      return NextResponse.json({ purchaseId, paid: true });
    }
    if (sync.outcome === "requires_action") {
      return NextResponse.json({
        purchaseId,
        requiresAction: true,
        clientSecret: sync.clientSecret,
        paymentIntentId: sync.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    if (sync.outcome === "processing") {
      return NextResponse.json({ purchaseId, processing: true, paymentIntentId: sync.paymentIntentId });
    }
    return NextResponse.json(
      { error: sync.message ?? "Payment not completed.", code: sync.code, paymentFailed: true },
      { status: 402 },
    );
  }

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

  const commerceBlock = await getLiveBuyerCommerceBlock({ liveRoomId, userId });
  if (commerceBlock) {
    return NextResponse.json({ error: commerceBlock.error, code: commerceBlock.code }, { status: commerceBlock.status });
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(userId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
    const shipping = await resolveBuyerDefaultShippingForOrder(userId);
    if (!shipping) {
      return NextResponse.json(
        {
          error: "Add a complete shipping address (street, city, state, ZIP) to your Wallet before buying.",
          code: "NO_SHIPPING_ADDRESS",
          paymentFailed: true,
        },
        { status: 402 },
      );
    }
  }

  const qtyRaw = body.quantity;
  const quantity =
    typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(99, Math.floor(qtyRaw)) : 1;
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 128) ?? null;
  if (idempotencyKey) {
    const existing = await prisma.liveItemVariantPurchase.findFirst({
      where: { idempotencyKey, buyerId: userId },
      select: { id: true, paymentStatus: true, totalUsd: true },
    });
    if (existing) {
      if (existing.paymentStatus === "paid") {
        return NextResponse.json({ purchaseId: existing.id, paid: true });
      }
      let canSettle = existing.paymentStatus === "pending_payment";
      if (existing.paymentStatus === "failed" && existing.totalUsd > 0 && isStripeConfigured()) {
        const reopened = await reopenVariantPurchaseForRecovery({
          purchaseId: existing.id,
          buyerId: userId,
        });
        if (!reopened.reopened) {
          const code = reopened.reason ?? "PURCHASE_NOT_PAYABLE";
          const error =
            code === "SOLD_OUT"
              ? "That option is sold out."
              : code === "PURCHASES_LOCKED"
                ? "Purchases are locked for this room."
                : "Could not retry this purchase.";
          return NextResponse.json({ error, code, paymentFailed: true, purchaseId: existing.id }, { status: 409 });
        }
        canSettle = true;
      }
      if (canSettle && existing.totalUsd > 0 && isStripeConfigured()) {
        const settled = await settleLiveItemVariantPurchase({
          buyerId: userId,
          purchaseId: existing.id,
          paymentMethodId,
        });
        if (settled.ok && "paid" in settled && settled.paid) {
          return NextResponse.json({ purchaseId: settled.purchaseId, paid: true });
        }
        if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
          return NextResponse.json({
            purchaseId: settled.purchaseId,
            requiresAction: true,
            clientSecret: settled.clientSecret,
            paymentIntentId: settled.paymentIntentId,
            publishableKey: stripePublishableKey(),
          });
        }
        if (settled.ok && "processing" in settled && settled.processing) {
          return NextResponse.json({
            purchaseId: settled.purchaseId,
            processing: true,
            paymentIntentId: settled.paymentIntentId,
          });
        }
        if (!settled.ok) {
          const paymentFailure = await getUnresolvedPaymentFailureForBuyer(liveRoomId, userId);
          return NextResponse.json(
            {
              error: settled.message,
              code: settled.code,
              paymentFailed: true,
              purchaseId: settled.purchaseId,
              paymentFailure,
              ...checkoutFailureDebug(settled.code, settled.fulfillmentDetail),
            },
            { status: 402 },
          );
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
              biddingOpen: true,
              auctionVariantId: true,
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
      if (item.biddingOpen && item.auctionVariantId === variantId) {
        throw Object.assign(new Error("SPOT_AUCTION_LIVE"), { code: "SPOT_AUCTION_LIVE" });
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
          data: { status: "sold_out", isHot: false },
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

    let settled;
    try {
      settled = await settleLiveItemVariantPurchase({
        buyerId: userId,
        purchaseId: result.id,
        paymentMethodId,
      });
    } catch (settleErr) {
      console.error("[variant purchase POST] settle failed", settleErr);
      await releaseVariantPurchaseOnCheckoutExpired(result.id);
      return NextResponse.json(
        { error: "Could not complete purchase.", paymentFailed: true, purchaseId: result.id },
        { status: 500 },
      );
    }

    if (settled.ok && "paid" in settled && settled.paid) {
      return NextResponse.json({ purchaseId: settled.purchaseId, paid: true });
    }
    if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({
        purchaseId: settled.purchaseId,
        requiresAction: true,
        clientSecret: settled.clientSecret,
        paymentIntentId: settled.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    if (settled.ok && "processing" in settled && settled.processing) {
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({
        purchaseId: settled.purchaseId,
        processing: true,
        paymentIntentId: settled.paymentIntentId,
      });
    }
    if (!settled.ok) {
      const paymentFailure = await getUnresolvedPaymentFailureForBuyer(liveRoomId, userId);
      return NextResponse.json(
        {
          error: settled.message,
          code: settled.code,
          paymentFailed: true,
          purchaseId: settled.purchaseId,
          paymentFailure,
          ...checkoutFailureDebug(settled.code, settled.fulfillmentDetail),
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ error: "Could not complete payment." }, { status: 500 });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Option not found." }, { status: 404 });
    if (code === "NOT_VARIANT_ITEM") {
      return NextResponse.json({ error: "This item does not support spot selection." }, { status: 400 });
    }
    if (code === "ITEM_UNAVAILABLE") return NextResponse.json({ error: "This item is not available." }, { status: 409 });
    if (code === "SPOT_AUCTION_LIVE") {
      return NextResponse.json({ error: "This spot is in a live auction — place a bid instead." }, { status: 409 });
    }
    if (code === "SOLD_OUT") return NextResponse.json({ error: "That option is sold out." }, { status: 409 });
    console.error("[variant purchase POST]", e);
    return NextResponse.json({ error: "Could not complete purchase." }, { status: 500 });
  }
}
