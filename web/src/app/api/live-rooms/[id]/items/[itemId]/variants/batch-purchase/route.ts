import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import {
  finalizeLiveItemVariantPurchaseBatchPaid,
  LIVE_VARIANT_BATCH_MAX_SPOTS,
  releaseVariantPurchaseBatchOnCheckoutExpired,
  reopenVariantPurchaseBatchForRecovery,
} from "@/lib/live-item-variant-batch-purchase";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import { isRandomVariantAssignment } from "@/lib/live-item-variant-random-reveal";
import {
  settleLiveItemVariantPurchaseBatch,
  syncLiveItemVariantPurchaseBatchPaymentIntent,
} from "@/lib/live-payment-pipeline";
import { prisma } from "@/lib/prisma";
import { getLiveBuyerCommerceBlock, getLiveRoomBroadcastCommerceBlock, isLiveRoomOpenForSpotPurchase } from "@/lib/live-room-commerce-guards";
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
  variantIds?: unknown;
  paymentMethodId?: unknown;
  action?: unknown;
  batchId?: unknown;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: rawRoom, itemId } = await ctx.params;
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
    /* empty */
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action === "sync") {
    const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";
    if (!batchId) {
      return NextResponse.json({ error: "batchId is required." }, { status: 400 });
    }
    const sync = await syncLiveItemVariantPurchaseBatchPaymentIntent({ buyerId: userId, batchId });
    if (sync.outcome === "paid") {
      return NextResponse.json({ batchId, paid: true });
    }
    if (sync.outcome === "requires_action") {
      return NextResponse.json({
        batchId,
        requiresAction: true,
        clientSecret: sync.clientSecret,
        paymentIntentId: sync.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    if (sync.outcome === "processing") {
      return NextResponse.json({ batchId, processing: true, paymentIntentId: sync.paymentIntentId });
    }
    return NextResponse.json(
      { error: sync.message ?? "Payment not completed.", code: sync.code, paymentFailed: true },
      { status: 402 },
    );
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      lockPurchases: true,
      streamHealth: true,
      streamPaused: true,
      streamMode: true,
      streamStartedAt: true,
      streamEndedAt: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (!isLiveRoomOpenForSpotPurchase(room.status)) {
    return NextResponse.json(
      { error: "Team sales are only open before and during the live show.", code: "ROOM_NOT_OPEN_FOR_PURCHASE" },
      { status: 409 },
    );
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock(room, "purchase");
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
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

  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;

  const rawIds = Array.isArray(body.variantIds) ? body.variantIds : [];
  const variantIds = [
    ...new Set(
      rawIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (variantIds.length < 2) {
    return NextResponse.json(
      { error: "Select at least two spots for multi-spot checkout.", code: "BATCH_MIN_SPOTS" },
      { status: 400 },
    );
  }
  if (variantIds.length > LIVE_VARIANT_BATCH_MAX_SPOTS) {
    return NextResponse.json(
      { error: `You can buy at most ${LIVE_VARIANT_BATCH_MAX_SPOTS} spots at once.`, code: "BATCH_MAX_SPOTS" },
      { status: 400 },
    );
  }

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 128) ?? null;
  if (idempotencyKey) {
    const existing = await prisma.liveItemVariantPurchase.findFirst({
      where: { idempotencyKey, buyerId: userId },
      select: { id: true, batchId: true, paymentStatus: true, totalUsd: true },
    });
    if (existing?.batchId) {
      const batchRows = await prisma.liveItemVariantPurchase.findMany({
        where: { batchId: existing.batchId, buyerId: userId },
        select: { id: true, paymentStatus: true, totalUsd: true },
      });
      if (batchRows.every((r) => r.paymentStatus === "paid")) {
        return NextResponse.json({
          batchId: existing.batchId,
          purchaseIds: batchRows.map((r) => r.id),
          paid: true,
        });
      }
      let canSettle = batchRows.every((r) => r.paymentStatus === "pending_payment");
      if (batchRows.some((r) => r.paymentStatus === "failed") && isStripeConfigured()) {
        const reopened = await reopenVariantPurchaseBatchForRecovery({
          batchId: existing.batchId,
          buyerId: userId,
        });
        if (!reopened.reopened) {
          const code = reopened.reason ?? "PURCHASE_NOT_PAYABLE";
          return NextResponse.json(
            {
              error:
                code === "SOLD_OUT"
                  ? "One or more spots sold out."
                  : code === "PURCHASES_LOCKED"
                    ? "Purchases are locked for this room."
                    : "Could not retry this purchase.",
              code,
              paymentFailed: true,
              batchId: existing.batchId,
            },
            { status: 409 },
          );
        }
        canSettle = true;
      }
      if (canSettle && isStripeConfigured()) {
        const settled = await settleLiveItemVariantPurchaseBatch({
          buyerId: userId,
          batchId: existing.batchId,
          paymentMethodId,
        });
        if (settled.ok && "paid" in settled && settled.paid) {
          return NextResponse.json({
            batchId: settled.batchId,
            purchaseIds: settled.purchaseIds,
            paid: true,
          });
        }
        if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
          return NextResponse.json({
            batchId: settled.batchId,
            purchaseIds: settled.purchaseIds,
            requiresAction: true,
            clientSecret: settled.clientSecret,
            paymentIntentId: settled.paymentIntentId,
            publishableKey: stripePublishableKey(),
          });
        }
        if (settled.ok && "processing" in settled && settled.processing) {
          return NextResponse.json({
            batchId: settled.batchId,
            purchaseIds: settled.purchaseIds,
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
              batchId: settled.batchId,
              purchaseIds: settled.purchaseIds,
              paymentFailure,
              ...checkoutFailureDebug(settled.code, settled.fulfillmentDetail),
            },
            { status: 402 },
          );
        }
      }
    }
  }

  const batchId = randomUUID();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.liveRoomItem.findFirst({
        where: { id: itemId, liveRoomId },
        select: {
          id: true,
          status: true,
          salesFormat: true,
          biddingOpen: true,
          auctionVariantId: true,
          activeSpotCommerceMode: true,
          variantAssignmentMode: true,
        },
      });
      if (!item) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      if (!isVariantSalesFormat(item.salesFormat)) {
        throw Object.assign(new Error("NOT_VARIANT_ITEM"), { code: "NOT_VARIANT_ITEM" });
      }
      if (item.status !== "active" && item.status !== "queued") {
        throw Object.assign(new Error("ITEM_UNAVAILABLE"), { code: "ITEM_UNAVAILABLE" });
      }
      if (isRandomVariantAssignment(item.variantAssignmentMode)) {
        throw Object.assign(new Error("RANDOM_REVEAL_BATCH_UNSUPPORTED"), {
          code: "RANDOM_REVEAL_BATCH_UNSUPPORTED",
        });
      }

      const variants = await tx.liveItemVariant.findMany({
        where: { id: { in: variantIds }, liveRoomItemId: item.id },
        select: {
          id: true,
          label: true,
          priceUsd: true,
          quantityRemaining: true,
          status: true,
          isHot: true,
        },
      });
      if (variants.length !== variantIds.length) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }

      const purchaseIds: string[] = [];
      let itemSumUsd = 0;
      const labels: string[] = [];

      for (const variantId of variantIds) {
        const variant = variants.find((v) => v.id === variantId)!;
        if (item.biddingOpen && item.auctionVariantId === variantId) {
          throw Object.assign(new Error("SPOT_AUCTION_LIVE"), { code: "SPOT_AUCTION_LIVE" });
        }
        if (
          item.activeSpotCommerceMode === "auction" &&
          !item.biddingOpen &&
          (variant.isHot || item.auctionVariantId === variantId)
        ) {
          throw Object.assign(new Error("SPOT_AUCTION_ARMED"), { code: "SPOT_AUCTION_ARMED" });
        }
        const updated = await tx.liveItemVariant.updateMany({
          where: { id: variantId, quantityRemaining: { gte: 1 } },
          data: {
            quantityRemaining: { decrement: 1 },
            soldCount: { increment: 1 },
          },
        });
        if (updated.count === 0) {
          throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
        }
        const unitPriceUsd = variant.priceUsd;
        const totalUsd = Math.round(unitPriceUsd * 100) / 100;
        itemSumUsd += totalUsd;
        labels.push(variant.label);

        const purchase = await tx.liveItemVariantPurchase.create({
          data: {
            liveRoomId,
            liveRoomItemId: item.id,
            variantId: variant.id,
            buyerId: userId,
            quantity: 1,
            unitPriceUsd,
            totalUsd,
            paymentStatus: totalUsd <= 0 ? "paid" : "pending_payment",
            batchId,
            // Only the first row stores the client idempotency key (unique constraint).
            idempotencyKey: purchaseIds.length === 0 ? (idempotencyKey ?? undefined) : undefined,
            paidAt: totalUsd <= 0 ? new Date() : undefined,
          },
          select: { id: true },
        });
        purchaseIds.push(purchase.id);

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
      }

      await tx.liveRoomItem.update({
        where: { id: item.id },
        data: { itemVersion: { increment: 1 } },
      });

      return {
        batchId,
        purchaseIds,
        itemSumUsd: Math.round(itemSumUsd * 100) / 100,
        labels,
      };
    });

    if (result.itemSumUsd <= 0 || !isStripeConfigured()) {
      await finalizeLiveItemVariantPurchaseBatchPaid(result.batchId);
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({
        batchId: result.batchId,
        purchaseIds: result.purchaseIds,
        labels: result.labels,
        paid: true,
      });
    }

    let settled;
    try {
      settled = await settleLiveItemVariantPurchaseBatch({
        buyerId: userId,
        batchId: result.batchId,
        paymentMethodId,
      });
    } catch (settleErr) {
      console.error("[variant batch purchase POST] settle failed", settleErr);
      await releaseVariantPurchaseBatchOnCheckoutExpired(result.batchId);
      const code =
        settleErr && typeof settleErr === "object" && "code" in settleErr
          ? String((settleErr as { code: string }).code)
          : undefined;
      const rawMessage = settleErr instanceof Error ? settleErr.message.trim() : "";
      const safeMessage =
        rawMessage &&
        rawMessage.length <= 160 &&
        !/stripe|payment_intent|prisma|sql|undefined|null/i.test(rawMessage) &&
        !rawMessage.includes(" at ")
          ? rawMessage
          : "Could not complete purchase.";
      return NextResponse.json(
        {
          error: safeMessage,
          ...(code ? { code } : {}),
          paymentFailed: true,
          batchId: result.batchId,
          purchaseIds: result.purchaseIds,
        },
        { status: 500 },
      );
    }

    if (settled.ok && "paid" in settled && settled.paid) {
      return NextResponse.json({
        batchId: settled.batchId,
        purchaseIds: settled.purchaseIds,
        labels: result.labels,
        paid: true,
      });
    }
    if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({
        batchId: settled.batchId,
        purchaseIds: settled.purchaseIds,
        labels: result.labels,
        requiresAction: true,
        clientSecret: settled.clientSecret,
        paymentIntentId: settled.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    if (settled.ok && "processing" in settled && settled.processing) {
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({
        batchId: settled.batchId,
        purchaseIds: settled.purchaseIds,
        labels: result.labels,
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
          batchId: settled.batchId,
          purchaseIds: settled.purchaseIds,
          paymentFailure,
          ...checkoutFailureDebug(settled.code, settled.fulfillmentDetail),
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ error: "Could not complete payment." }, { status: 500 });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "One or more spots were not found." }, { status: 404 });
    if (code === "NOT_VARIANT_ITEM") {
      return NextResponse.json({ error: "This item does not support spot selection." }, { status: 400 });
    }
    if (code === "ITEM_UNAVAILABLE") return NextResponse.json({ error: "This item is not available." }, { status: 409 });
    if (code === "SPOT_AUCTION_LIVE") {
      return NextResponse.json(
        { error: "One of the selected spots is in a live auction — deselect it or place a bid instead." },
        { status: 409 },
      );
    }
    if (code === "SPOT_AUCTION_ARMED") {
      return NextResponse.json(
        {
          error:
            "One of the selected teams is pinned for auction. Wait for the host to start bidding — it is not for sale at the tile price.",
        },
        { status: 409 },
      );
    }
    if (code === "SOLD_OUT") {
      return NextResponse.json({ error: "One or more selected spots just sold out." }, { status: 409 });
    }
    if (code === "RANDOM_REVEAL_BATCH_UNSUPPORTED") {
      return NextResponse.json(
        { error: "Random reveal spots can only be purchased one at a time.", code },
        { status: 400 },
      );
    }
    console.error("[variant batch purchase POST]", e);
    return NextResponse.json({ error: "Could not complete purchase." }, { status: 500 });
  }
}
