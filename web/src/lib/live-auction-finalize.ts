import { prisma } from "@/lib/prisma";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import type { LiveRoomType } from "@/generated/prisma/client";
import { closeActiveLiveRoomItemUnitSale } from "@/lib/live-room-item-unit-sale";
import { sendBreakAuctionWinNotificationsDeferred } from "@/lib/break-live-auction-round-finalize";
import { notifyLiveAuctionWinPaymentOutcome } from "@/lib/live-auction-win-payment-notify";
import { recordPaymentFailureFromCharge } from "@/lib/live-room-payment-failure";
import {
  chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard,
  type ChargeOrderSavedPmOutcome,
} from "@/lib/stripe-charge-order-saved-pm";
import {
  emitActiveItemChanged,
  emitLiveRoomQueueItemsChanged,
  emitPurchaseCompleted,
} from "@/lib/realtime-emit-server";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";

/**
 * Grace after `auctionEndsAt` before the server force-finalizes an overdue lot. Kept small so the
 * lot closes promptly once the (already extension-adjusted) timer is past, but large enough to
 * absorb clock skew and let an in-flight last-second bid land first.
 */
export const LIVE_AUCTION_AUTO_CLOSE_GRACE_MS = 1500;

export type FinalizeTrigger = "manual" | "timer_nudge" | "read_sweep";

/** Reusable error codes thrown by the settle path (mapped to HTTP by the manual route). */
export type LiveAuctionSettleError =
  | "ITEM_NOT_FOUND"
  | "ITEM_ALREADY_SOLD"
  | "ITEM_NOT_ACTIVE"
  | "LIVE_AUCTION_NO_WINNER"
  | "LIVE_AUCTION_ORDER_MISSING";

export type SettleAndChargeResult = {
  orderId: string | null;
  itemSoldOut: boolean;
  winnerId: string | null;
  autoCharge: ChargeOrderSavedPmOutcome;
};

type RoomCtx = {
  sellerId: string;
  roomType: LiveRoomType;
  roomVersion: number;
};

function chargeOutcomeToPaymentStatus(outcome: ChargeOrderSavedPmOutcome["outcome"]): string {
  return outcome === "paid"
    ? "paid"
    : outcome === "requires_action" || outcome === "processing"
      ? "requires_action"
      : outcome === "error"
        ? "payment_failed"
        : "pending";
}

/**
 * Settle a live auction/break lot to its winner, charge the winner's saved card, emit realtime,
 * and record a payment-failure for buyer recovery on charge failure. This is the single source of
 * truth shared by the manual host "mark sold" route and the automatic timer-zero finalize. It is
 * idempotent: the transaction only settles a lot still in `active` status, so concurrent callers
 * (manual click, timer nudge, read-sweep across multiple polls) cannot double-settle or
 * double-charge — losers throw `ITEM_ALREADY_SOLD` / `ITEM_NOT_ACTIVE`.
 *
 * Throws `LiveAuctionSettleError` strings (see type) for the caller to map.
 */
export async function settleAndChargeLiveAuctionLot(args: {
  liveRoomId: string;
  itemId: string;
  room: RoomCtx;
  trigger: FinalizeTrigger;
}): Promise<SettleAndChargeResult> {
  const { liveRoomId, itemId, room, trigger } = args;

  const settled = await prisma.$transaction(async (tx) => {
    const cur = await tx.liveRoomItem.findFirst({
      where: { id: itemId, liveRoomId },
      select: { status: true, itemVersion: true, lastHighBidderId: true },
    });
    if (!cur) throw new Error("ITEM_NOT_FOUND");
    if (cur.status === "sold") throw new Error("ITEM_ALREADY_SOLD");
    if (cur.status !== "active") throw new Error("ITEM_NOT_ACTIVE");
    const closed = await closeActiveLiveRoomItemUnitSale(tx, {
      liveRoomId,
      liveRoomItemId: itemId,
      sellerId: room.sellerId,
      roomType: room.roomType,
      skipWinNotifications: true,
    });
    if (!closed.closed) throw new Error("LIVE_AUCTION_NO_WINNER");
    const roomNext = await tx.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { roomVersion: true },
    });
    const itemNext = await tx.liveRoomItem.findUnique({
      where: { id: itemId },
      select: { itemVersion: true, status: true, listingId: true },
    });
    if (closed.orderId && room.roomType === "auction") {
      const ord = await tx.order.findUnique({ where: { id: closed.orderId }, select: { id: true } });
      if (!ord) throw new Error("LIVE_AUCTION_ORDER_MISSING");
    }
    return {
      roomVersion: roomNext?.roomVersion ?? room.roomVersion,
      itemVersion: itemNext?.itemVersion ?? cur.itemVersion + 1,
      orderId: closed.orderId,
      buyerId: closed.buyerId,
      sellerId: closed.sellerId,
      listingTitle: closed.listingTitle,
      itemPriceUsd: closed.itemPriceUsd,
      itemSoldOut: closed.itemSoldOut,
      pendingWinNotifications: closed.pendingWinNotifications,
    };
  });

  console.info("[auction close] winner resolved", {
    trigger,
    liveRoomId,
    itemId,
    orderId: settled.orderId ?? null,
    buyerId: settled.buyerId ?? null,
    winningAmountUsd: settled.itemPriceUsd ?? null,
    itemSoldOut: settled.itemSoldOut,
  });

  if (settled.orderId && settled.buyerId && settled.sellerId) {
    const orderRow = await prisma.order.findUnique({
      where: { id: settled.orderId },
      select: { listingId: true, paymentStatus: true, status: true },
    });
    if (orderRow) {
      emitOrderLifecycleSync({
        orderId: settled.orderId,
        parties: { sellerId: settled.sellerId, buyerId: settled.buyerId },
        listingId: orderRow.listingId,
        orderStatus: orderRow.status,
        paymentStatus: orderRow.paymentStatus,
        extraPayload: { liveShowId: liveRoomId },
      });
    }
  }

  if (settled.pendingWinNotifications) {
    void sendBreakAuctionWinNotificationsDeferred(settled.pendingWinNotifications).catch((err) =>
      console.error("[auction close] deferred win notifications", err),
    );
  }

  const winnerUsername = settled.buyerId
    ? (await prisma.user.findUnique({ where: { id: settled.buyerId }, select: { username: true } }))?.username ?? null
    : null;

  if (!settled.itemSoldOut) {
    emitActiveItemChanged(liveRoomId, itemId, {
      roomVersion: settled.roomVersion,
      itemVersion: settled.itemVersion,
      biddingOpen: false,
      auctionEndsAt: null,
    });
    emitLiveRoomQueueItemsChanged(liveRoomId);
  }

  let autoCharge: ChargeOrderSavedPmOutcome = { outcome: "error", code: "NO_BUYER" };
  if (settled.buyerId && settled.orderId) {
    console.info("[auction close] charging winner", {
      trigger,
      liveRoomId,
      itemId,
      orderId: settled.orderId,
      buyerId: settled.buyerId,
      amountUsd: settled.itemPriceUsd ?? null,
    });
    try {
      autoCharge = await chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard({
        buyerId: settled.buyerId,
        orderId: settled.orderId,
      });
    } catch (err) {
      console.error("[auction close] auto-charge exception", err);
      autoCharge = { outcome: "error", code: "CHARGE_EXCEPTION" };
    }
    const paymentStatus = chargeOutcomeToPaymentStatus(autoCharge.outcome);
    emitPurchaseCompleted(liveRoomId, itemId, {
      roomVersion: settled.roomVersion,
      itemVersion: settled.itemVersion,
      winnerUsername,
      winnerId: settled.buyerId,
      winningAmountUsd: settled.itemPriceUsd,
      itemTitle: settled.listingTitle ?? null,
      orderId: settled.orderId,
      paymentStatus,
    });
    if (settled.sellerId && settled.listingTitle && settled.itemPriceUsd != null) {
      try {
        await notifyLiveAuctionWinPaymentOutcome({
          buyerId: settled.buyerId,
          sellerId: settled.sellerId,
          orderId: settled.orderId,
          listingTitle: settled.listingTitle,
          itemPriceUsd: settled.itemPriceUsd,
          charge: autoCharge,
        });
      } catch (err) {
        console.error("[auction close] win notify", err);
      }
    }
    if (autoCharge.outcome === "paid") {
      console.info("[auction close] payment success", {
        trigger,
        liveRoomId,
        itemId,
        orderId: settled.orderId,
        buyerId: settled.buyerId,
      });
      void recordBuyerGiveawayPurchaseEntries(liveRoomId, settled.buyerId, settled.orderId).catch((e) => {
        console.error("[auction close] buyers giveaway entry", e);
      });
    } else {
      console.info("[auction close] payment failed", {
        trigger,
        liveRoomId,
        itemId,
        orderId: settled.orderId,
        buyerId: settled.buyerId,
        outcome: autoCharge.outcome,
        code: autoCharge.outcome === "error" ? autoCharge.code : undefined,
      });
      await recordPaymentFailureFromCharge({
        liveRoomId,
        buyerId: settled.buyerId,
        kind: "auction_win",
        liveRoomItemId: itemId,
        orderId: settled.orderId,
        amountUsd: settled.itemPriceUsd ?? 0,
        itemTitle: settled.listingTitle ?? undefined,
        charge: autoCharge,
      });
    }
  } else if (settled.buyerId) {
    emitPurchaseCompleted(liveRoomId, itemId, {
      roomVersion: settled.roomVersion,
      itemVersion: settled.itemVersion,
      winnerUsername,
      winnerId: settled.buyerId,
      winningAmountUsd: settled.itemPriceUsd,
      orderId: settled.orderId ?? null,
      paymentStatus: "pending",
    });
  }

  return {
    orderId: settled.orderId ?? null,
    itemSoldOut: settled.itemSoldOut,
    winnerId: settled.buyerId ?? null,
    autoCharge,
  };
}

/**
 * Close an overdue auction lot that has no winning bidder: mark it skipped, clear bid state, and
 * emit so both seller and buyer move off the lot. No order is created and no one is charged.
 * Idempotent via the `status === "active"` guard in the update.
 */
export async function closeLiveAuctionLotNoWinner(args: {
  liveRoomId: string;
  itemId: string;
  room: RoomCtx;
  trigger: FinalizeTrigger;
}): Promise<{ closed: boolean }> {
  const { liveRoomId, itemId, trigger } = args;
  const next = await prisma.$transaction(async (tx) => {
    const updated = await tx.liveRoomItem.updateMany({
      where: { id: itemId, liveRoomId, status: "active" },
      data: { status: "skipped", biddingOpen: false, auctionEndsAt: null, clutchTimeEnabled: false, itemVersion: { increment: 1 } },
    });
    if (updated.count === 0) return null;
    const roomNext = await tx.liveRoom.update({
      where: { id: liveRoomId },
      data: { roomVersion: { increment: 1 } },
      select: { roomVersion: true },
    });
    const itemNext = await tx.liveRoomItem.findUnique({ where: { id: itemId }, select: { itemVersion: true } });
    return { roomVersion: roomNext.roomVersion, itemVersion: itemNext?.itemVersion ?? 0 };
  });
  if (!next) return { closed: false };
  emitPurchaseCompleted(liveRoomId, itemId, {
    roomVersion: next.roomVersion,
    itemVersion: next.itemVersion,
    noBids: true,
  });
  emitActiveItemChanged(liveRoomId, itemId, {
    roomVersion: next.roomVersion,
    itemVersion: next.itemVersion,
    biddingOpen: false,
    auctionEndsAt: null,
  });
  emitLiveRoomQueueItemsChanged(liveRoomId);
  console.info("[auction close] no bids, closed unsold", { trigger, liveRoomId, itemId });
  return { closed: true };
}

export type OverdueFinalizeSummary = {
  finalized: number;
  results: Array<{ itemId: string; outcome: "sold" | "unsold" | "skipped_error"; orderId?: string | null; error?: string }>;
};

/**
 * Server-authoritative sweep: find active auction/break lots in this room whose server timer has
 * elapsed (`biddingOpen && auctionEndsAt <= now - grace`) and finalize each — settle+charge when a
 * winner exists, otherwise close unsold. Safe to call from any read/poll or an explicit nudge; the
 * underlying settle/close are idempotent so simultaneous callers can't double-process.
 */
export async function finalizeOverdueLiveAuctionLotsForRoom(args: {
  liveRoomId: string;
  room: RoomCtx;
  nowMs?: number;
  trigger: FinalizeTrigger;
}): Promise<OverdueFinalizeSummary> {
  const { liveRoomId, room, trigger } = args;
  if (room.roomType !== "auction" && room.roomType !== "break") {
    return { finalized: 0, results: [] };
  }
  const cutoff = new Date((args.nowMs ?? Date.now()) - LIVE_AUCTION_AUTO_CLOSE_GRACE_MS);
  const overdue = await prisma.liveRoomItem.findMany({
    where: {
      liveRoomId,
      status: "active",
      biddingOpen: true,
      auctionEndsAt: { not: null, lte: cutoff },
    },
    select: { id: true, lastHighBidderId: true, auctionEndsAt: true },
  });
  if (overdue.length === 0) return { finalized: 0, results: [] };

  const summary: OverdueFinalizeSummary = { finalized: 0, results: [] };
  for (const lot of overdue) {
    console.info("[auction close] timer expired", {
      trigger,
      liveRoomId,
      itemId: lot.id,
      auctionEndsAt: lot.auctionEndsAt?.toISOString() ?? null,
      hasWinner: Boolean(lot.lastHighBidderId?.trim()),
    });
    try {
      if (lot.lastHighBidderId?.trim()) {
        const r = await settleAndChargeLiveAuctionLot({ liveRoomId, itemId: lot.id, room, trigger });
        summary.finalized += 1;
        summary.results.push({ itemId: lot.id, outcome: "sold", orderId: r.orderId });
      } else {
        const c = await closeLiveAuctionLotNoWinner({ liveRoomId, itemId: lot.id, room, trigger });
        if (c.closed) summary.finalized += 1;
        summary.results.push({ itemId: lot.id, outcome: "unsold" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      // Expected when another concurrent caller already finalized this lot — not an error.
      if (msg === "ITEM_ALREADY_SOLD" || msg === "ITEM_NOT_ACTIVE" || msg === "LIVE_AUCTION_NO_WINNER") {
        summary.results.push({ itemId: lot.id, outcome: "skipped_error", error: msg });
        continue;
      }
      console.error("[auction close] finalize failed", { liveRoomId, itemId: lot.id, error: msg });
      summary.results.push({ itemId: lot.id, outcome: "skipped_error", error: msg });
    }
  }
  return summary;
}
