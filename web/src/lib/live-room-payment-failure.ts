import { NextResponse } from "next/server";
import type {
  LiveRoomPaymentFailureKind,
  LiveRoomPaymentFailureStatus,
} from "@/generated/prisma/enums";
import { createNotification } from "@/lib/notifications";
import {
  chargeLiveItemVariantPurchaseWithSavedCard,
  syncLiveItemVariantPurchasePaymentIntent,
  chargeBreakSpotWithSavedCard,
  syncBreakSpotPaymentIntent,
} from "@/lib/live-payment-pipeline";
import { finalizeLiveItemVariantPurchasePaid, releaseVariantPurchaseOnCheckoutExpired, reopenVariantPurchaseForRecovery } from "@/lib/live-item-variant-purchase";
import { finalizeBreakSpotPaid } from "@/lib/live-buy-now-purchase";
import { prisma } from "@/lib/prisma";
import {
  emitLiveRoomPaymentFailed,
  emitLiveRoomPaymentRecovered,
} from "@/lib/realtime-emit-server";
import type {
  ChargeOrderSavedPmOutcome,
  StripeChargeErrorDebug,
} from "@/lib/stripe-charge-order-saved-pm";
import {
  chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard,
  chargeLiveBuyNowOrderWithSavedCard,
  chargeMarketplaceOrderWithSavedPaymentMethod,
  chargeOutcomeReachedStripe,
  reopenExpiredAuctionOrderForRecovery,
  syncLiveBuyNowOrderPaymentIntent,
} from "@/lib/stripe-charge-order-saved-pm";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import {
  refreshRecoveryPaymentReferences,
  resolveBuyerRecoveryPaymentMethodId,
} from "@/lib/stripe-buyer-payment-method-setup";
import { assertPaymentMethodOwnedByUser } from "@/lib/stripe-customer";

export type LiveBuyerPaymentFailureDTO = {
  id: string;
  kind: LiveRoomPaymentFailureKind;
  liveRoomItemId: string | null;
  orderId: string | null;
  variantPurchaseId: string | null;
  breakSpotId: string | null;
  amountUsd: number;
  status: "payment_failed" | "recovery_pending";
  failureReason: string | null;
  failedAt: string;
  itemTitle: string | null;
  buyerUsername: string | null;
};

export type SellerPaymentFailureDTO = LiveBuyerPaymentFailureDTO & {
  buyerId: string;
};

const UNRESOLVED_STATUSES: LiveRoomPaymentFailureStatus[] = ["payment_failed", "recovery_pending"];

export function chargeOutcomeToFailureStatus(
  charge: ChargeOrderSavedPmOutcome,
): LiveRoomPaymentFailureStatus {
  if (charge.outcome === "paid") return "paid";
  if (charge.outcome === "requires_action" || charge.outcome === "processing") {
    return "recovery_pending";
  }
  return "payment_failed";
}

export function chargeOutcomeToFailureReason(charge: ChargeOrderSavedPmOutcome): string {
  if (charge.outcome === "error") {
    if (charge.code === "CARD_DECLINED") return "Your card was declined.";
    if (charge.code === "FULFILLMENT_ORDER_FAILED") {
      return charge.message ?? "Could not prepare checkout. Check your shipping address and try again.";
    }
    if (charge.code === "PURCHASE_NOT_PAYABLE") {
      return "This spot purchase expired — tap Fix payment again or ask the host to cancel the retry.";
    }
    if (charge.code === "SPOT_UNAVAILABLE") {
      return "That spot is no longer available — pick another team or ask the host to cancel this retry.";
    }
    return charge.message?.trim() || charge.code.replace(/_/g, " ").toLowerCase();
  }
  if (charge.outcome === "requires_action") return "Your bank requires additional verification.";
  if (charge.outcome === "processing") return "Payment is still processing.";
  return "Payment could not be completed.";
}

function serializeBuyerFailure(row: {
  id: string;
  kind: LiveRoomPaymentFailureKind;
  liveRoomItemId: string | null;
  orderId: string | null;
  variantPurchaseId: string | null;
  breakSpotId: string | null;
  amountUsd: number;
  status: LiveRoomPaymentFailureStatus;
  failureReason: string | null;
  failedAt: Date;
  itemTitle: string | null;
  buyerUsername: string | null;
}): LiveBuyerPaymentFailureDTO | null {
  if (!UNRESOLVED_STATUSES.includes(row.status)) return null;
  return {
    id: row.id,
    kind: row.kind,
    liveRoomItemId: row.liveRoomItemId,
    orderId: row.orderId,
    variantPurchaseId: row.variantPurchaseId,
    breakSpotId: row.breakSpotId,
    amountUsd: row.amountUsd,
    status: row.status as "payment_failed" | "recovery_pending",
    failureReason: row.failureReason,
    failedAt: row.failedAt.toISOString(),
    itemTitle: row.itemTitle,
    buyerUsername: row.buyerUsername,
  };
}

export async function getUnresolvedPaymentFailureForBuyer(
  liveRoomId: string,
  buyerId: string,
): Promise<LiveBuyerPaymentFailureDTO | null> {
  const row = await prisma.liveRoomPaymentFailure.findFirst({
    where: {
      liveRoomId,
      buyerId,
      status: { in: UNRESOLVED_STATUSES },
    },
    orderBy: { failedAt: "desc" },
  });
  return row ? serializeBuyerFailure(row) : null;
}

export async function listUnresolvedPaymentFailuresForRoom(
  liveRoomId: string,
): Promise<SellerPaymentFailureDTO[]> {
  const rows = await prisma.liveRoomPaymentFailure.findMany({
    where: { liveRoomId, status: { in: UNRESOLVED_STATUSES } },
    orderBy: { failedAt: "desc" },
    take: 20,
  });
  return rows
    .map((row) => {
      const base = serializeBuyerFailure(row);
      if (!base) return null;
      return { ...base, buyerId: row.buyerId };
    })
    .filter((r): r is SellerPaymentFailureDTO => r != null);
}

/** Blocks host from starting the next auction / buy-now lot while any buyer payment is unresolved. */
export async function liveRoomHostCommerceBlockResponse(
  liveRoomId: string,
): Promise<NextResponse | null> {
  const failures = await listUnresolvedPaymentFailuresForRoom(liveRoomId);
  if (failures.length === 0) return null;
  const pending = failures[0]!;
  return NextResponse.json(
    {
      error:
        "A buyer must fix their payment before you start the next auction or buy now. Check Sales for pending payment recovery.",
      code: "LIVE_HOST_PAYMENT_BLOCKED",
      paymentFailures: failures,
      pendingBuyerUsername: pending.buyerUsername,
      pendingItemTitle: pending.itemTitle,
      pendingAmountUsd: pending.amountUsd,
    },
    { status: 409 },
  );
}

export async function liveRoomPaymentBlockResponse(
  liveRoomId: string,
  buyerId: string,
): Promise<NextResponse | null> {
  const failure = await getUnresolvedPaymentFailureForBuyer(liveRoomId, buyerId);
  if (!failure) return null;
  return NextResponse.json(
    {
      error:
        "Fix your failed payment before bidding, buying, or tipping in this show.",
      code: "LIVE_PAYMENT_BLOCKED",
      paymentFailure: failure,
    },
    { status: 403 },
  );
}

export async function ensureLiveRoomPaymentFailureRecorded(args: {
  liveRoomId: string;
  buyerId: string;
  kind: LiveRoomPaymentFailureKind;
  orderId?: string | null;
  breakSpotId?: string | null;
  liveRoomItemId?: string | null;
  variantPurchaseId?: string | null;
  amountUsd: number;
  itemTitle?: string | null;
  failureReason?: string;
}): Promise<void> {
  const existing = await getUnresolvedPaymentFailureForBuyer(args.liveRoomId, args.buyerId);
  if (existing) return;
  await recordLiveRoomPaymentFailure({
    liveRoomId: args.liveRoomId,
    buyerId: args.buyerId,
    kind: args.kind,
    orderId: args.orderId,
    breakSpotId: args.breakSpotId,
    liveRoomItemId: args.liveRoomItemId,
    variantPurchaseId: args.variantPurchaseId,
    amountUsd: args.amountUsd,
    status: "payment_failed",
    failureReason: args.failureReason ?? "Payment could not be completed.",
    itemTitle: args.itemTitle,
  });
}

export async function recordLiveRoomPaymentFailure(args: {
  liveRoomId: string;
  buyerId: string;
  kind: LiveRoomPaymentFailureKind;
  liveRoomItemId?: string | null;
  orderId?: string | null;
  variantPurchaseId?: string | null;
  breakSpotId?: string | null;
  amountUsd: number;
  status: LiveRoomPaymentFailureStatus;
  failureReason: string;
  itemTitle?: string | null;
  buyerUsername?: string | null;
}): Promise<LiveBuyerPaymentFailureDTO> {
  const existing = await prisma.liveRoomPaymentFailure.findFirst({
    where: {
      liveRoomId: args.liveRoomId,
      buyerId: args.buyerId,
      status: { in: UNRESOLVED_STATUSES },
    },
  });

  const buyerUsername =
    args.buyerUsername ??
    (
      await prisma.user.findUnique({
        where: { id: args.buyerId },
        select: { username: true },
      })
    )?.username ??
    null;

  const row = existing
    ? await prisma.liveRoomPaymentFailure.update({
        where: { id: existing.id },
        data: {
          kind: args.kind,
          liveRoomItemId: args.liveRoomItemId ?? existing.liveRoomItemId,
          orderId: args.orderId ?? existing.orderId,
          variantPurchaseId: args.variantPurchaseId ?? existing.variantPurchaseId,
          breakSpotId: args.breakSpotId ?? existing.breakSpotId,
          amountUsd: args.amountUsd,
          status: args.status,
          failureReason: args.failureReason,
          itemTitle: args.itemTitle ?? existing.itemTitle,
          buyerUsername,
        },
      })
    : await prisma.liveRoomPaymentFailure.create({
        data: {
          liveRoomId: args.liveRoomId,
          buyerId: args.buyerId,
          kind: args.kind,
          liveRoomItemId: args.liveRoomItemId ?? undefined,
          orderId: args.orderId ?? undefined,
          variantPurchaseId: args.variantPurchaseId ?? undefined,
          breakSpotId: args.breakSpotId ?? undefined,
          amountUsd: args.amountUsd,
          status: args.status,
          failureReason: args.failureReason,
          itemTitle: args.itemTitle ?? undefined,
          buyerUsername: buyerUsername ?? undefined,
        },
      });

  const dto = serializeBuyerFailure(row)!;
  emitLiveRoomPaymentFailed(args.liveRoomId, {
    failureId: row.id,
    buyerId: args.buyerId,
    buyerUsername,
    amountUsd: args.amountUsd,
    itemTitle: row.itemTitle,
    liveRoomItemId: row.liveRoomItemId,
    orderId: row.orderId,
    kind: args.kind,
    failureReason: args.failureReason,
  });
  return dto;
}

export async function resolveLiveRoomPaymentFailure(args: {
  failureId: string;
  liveRoomId: string;
  buyerId: string;
  buyerUsername?: string | null;
}): Promise<void> {
  const row = await prisma.liveRoomPaymentFailure.updateMany({
    where: {
      id: args.failureId,
      liveRoomId: args.liveRoomId,
      buyerId: args.buyerId,
      status: { in: UNRESOLVED_STATUSES },
    },
    data: { status: "paid", recoveredAt: new Date() },
  });
  if (row.count === 0) return;

  const failure = await prisma.liveRoomPaymentFailure.findUnique({
    where: { id: args.failureId },
    select: {
      amountUsd: true,
      itemTitle: true,
      buyerUsername: true,
      liveRoomItemId: true,
      orderId: true,
    },
  });

  const username = args.buyerUsername ?? failure?.buyerUsername ?? "buyer";
  emitLiveRoomPaymentRecovered(args.liveRoomId, {
    failureId: args.failureId,
    buyerId: args.buyerId,
    buyerUsername: username,
    amountUsd: failure?.amountUsd ?? null,
    itemTitle: failure?.itemTitle ?? null,
    orderId: failure?.orderId ?? null,
  });

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (room?.sellerId) {
    await createNotification(prisma, {
      userId: room.sellerId,
      type: "item_sold",
      title: "Payment recovered",
      body: `Payment recovered for @${username}${failure?.itemTitle ? ` — ${failure.itemTitle}` : ""}.`,
      href: "/account/sales",
    });
  }
}

export async function recordPaymentFailureFromCharge(args: {
  liveRoomId: string;
  buyerId: string;
  kind: LiveRoomPaymentFailureKind;
  liveRoomItemId?: string | null;
  orderId?: string | null;
  variantPurchaseId?: string | null;
  breakSpotId?: string | null;
  amountUsd: number;
  itemTitle?: string | null;
  charge: ChargeOrderSavedPmOutcome;
}): Promise<LiveBuyerPaymentFailureDTO | null> {
  if (args.charge.outcome === "paid") return null;
  const status = chargeOutcomeToFailureStatus(args.charge);
  return recordLiveRoomPaymentFailure({
    liveRoomId: args.liveRoomId,
    buyerId: args.buyerId,
    kind: args.kind,
    liveRoomItemId: args.liveRoomItemId,
    orderId: args.orderId,
    variantPurchaseId: args.variantPurchaseId,
    breakSpotId: args.breakSpotId,
    amountUsd: args.amountUsd,
    status,
    failureReason: chargeOutcomeToFailureReason(args.charge),
    itemTitle: args.itemTitle,
  });
}

/** Outcome shape shared by order / variant / break-spot saved-card charges (paymentIntentId when present). */
type RecoveryChargeOutcome = {
  outcome: string;
  code?: string;
  paymentIntentId?: string;
};

/**
 * Diagnostic fields mirroring the "[payment recovery] retry charge result" log line. Surfaced in the
 * retry response body only on beta/non-prod so a failing attempt is debuggable without dashboard access.
 */
export type RecoveryRetryDebug = {
  failureId: string;
  orderId: string | null;
  variantPurchaseId: string | null;
  breakSpotId: string | null;
  paymentMethodId: string | null;
  outcome: string | null;
  code: string | null;
  paymentIntentId: string | null;
  reachedStripe: boolean | null;
  reopened: boolean | null;
  reopenReason: string | null;
  stripeError: StripeChargeErrorDebug | null;
  fulfillmentDetail?: string | null;
};

/**
 * Single structured log line for a recovery retry charge. From it alone we can tell whether the retry
 * failed before Stripe, reached Stripe, created/advanced a PaymentIntent, or succeeded.
 */
function logRecoveryChargeResult(
  ref: {
    failureId: string;
    paymentMethodId: string;
    orderId?: string | null;
    variantPurchaseId?: string | null;
    breakSpotId?: string | null;
  },
  charge: RecoveryChargeOutcome,
): void {
  const code = charge.outcome === "error" ? (charge.code ?? null) : null;
  const paymentIntentId = charge.paymentIntentId ?? null;
  console.info("[payment recovery] retry charge result", {
    failureId: ref.failureId,
    orderId: ref.orderId ?? null,
    variantPurchaseId: ref.variantPurchaseId ?? null,
    breakSpotId: ref.breakSpotId ?? null,
    paymentMethodId: ref.paymentMethodId,
    outcome: charge.outcome,
    code,
    paymentIntentId,
    reachedStripe: chargeOutcomeReachedStripe(charge.outcome, code),
  });
}

export async function retryLiveRoomPaymentFailure(args: {
  liveRoomId: string;
  buyerId: string;
  failureId?: string;
  /** When the buyer just saved a new card in recovery, charge that PM instead of re-resolving default. */
  paymentMethodId?: string | null;
}): Promise<
  | { ok: true; paid: true }
  | { ok: true; requiresAction: true; clientSecret: string; paymentIntentId: string }
  | { ok: true; processing: true }
  | {
      ok: false;
      error: string;
      code: string;
      paymentFailure: LiveBuyerPaymentFailureDTO;
      debug?: RecoveryRetryDebug;
    }
> {
  console.info("[payment failure] retry payment started", {
    liveRoomId: args.liveRoomId,
    buyerId: args.buyerId,
    failureId: args.failureId ?? null,
  });

  const failureRow = args.failureId
    ? await prisma.liveRoomPaymentFailure.findFirst({
        where: {
          id: args.failureId,
          liveRoomId: args.liveRoomId,
          buyerId: args.buyerId,
          status: { in: UNRESOLVED_STATUSES },
        },
      })
    : await prisma.liveRoomPaymentFailure.findFirst({
        where: {
          liveRoomId: args.liveRoomId,
          buyerId: args.buyerId,
          status: { in: UNRESOLVED_STATUSES },
        },
        orderBy: { failedAt: "desc" },
      });

  if (!failureRow) {
    return { ok: true, paid: true };
  }

  await prisma.liveRoomPaymentFailure.update({
    where: { id: failureRow.id },
    data: { status: "recovery_pending" },
  });

  let recoveryPmId: string | null = null;
  const preferredPm = args.paymentMethodId?.trim() ?? "";
  if (preferredPm) {
    try {
      await assertPaymentMethodOwnedByUser(args.buyerId, preferredPm);
      recoveryPmId = preferredPm;
    } catch {
      recoveryPmId = null;
    }
  }
  if (!recoveryPmId) {
    recoveryPmId = await resolveBuyerRecoveryPaymentMethodId(args.buyerId);
  }
  if (!recoveryPmId) {
    const updated = await recordLiveRoomPaymentFailure({
      liveRoomId: args.liveRoomId,
      buyerId: args.buyerId,
      kind: failureRow.kind,
      liveRoomItemId: failureRow.liveRoomItemId,
      orderId: failureRow.orderId,
      variantPurchaseId: failureRow.variantPurchaseId,
      breakSpotId: failureRow.breakSpotId,
      amountUsd: failureRow.amountUsd,
      status: "payment_failed",
      failureReason: "Add a saved payment method to your Wallet.",
      itemTitle: failureRow.itemTitle,
      buyerUsername: failureRow.buyerUsername,
    });
    return {
      ok: false,
      error: "Add a saved payment method to your Wallet.",
      code: "NO_SAVED_CARD",
      paymentFailure: updated,
    };
  }

  await refreshRecoveryPaymentReferences({
    buyerId: args.buyerId,
    paymentMethodId: recoveryPmId,
    orderId: failureRow.orderId,
    variantPurchaseId: failureRow.variantPurchaseId,
    breakSpotId: failureRow.breakSpotId,
  });

  let charge: ChargeOrderSavedPmOutcome | null = null;
  let reopenedForRecovery: boolean | null = null;
  let reopenReason: string | null = null;
  if (failureRow.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: failureRow.orderId, buyerId: args.buyerId },
      select: { paymentStatus: true, listing: { select: { buyingFormat: true } } },
    });
    if (order?.paymentStatus === "paid") {
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
    // Active recovery only: an auction winner who saved a fresh card may have let the original payment
    // window lapse. Re-open the order so the retry below can charge, instead of hard-failing with
    // ORDER_PAYMENT_EXPIRED. No-ops for non-auction / already-paid / un-reservable items.
    const reopen = await reopenExpiredAuctionOrderForRecovery({
      orderId: failureRow.orderId,
      buyerId: args.buyerId,
    });
    reopenedForRecovery = reopen.reopened;
    reopenReason = reopen.reason ?? null;
    charge =
      order?.listing.buyingFormat === "auction"
        ? await chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard({
            buyerId: args.buyerId,
            orderId: failureRow.orderId,
            paymentMethodId: recoveryPmId,
          })
        : failureRow.kind === "buy_now" && failureRow.liveRoomItemId
          ? await chargeLiveBuyNowOrderWithSavedCard({
              buyerId: args.buyerId,
              orderId: failureRow.orderId,
              liveRoomId: args.liveRoomId,
              liveRoomItemId: failureRow.liveRoomItemId,
              paymentMethodId: recoveryPmId,
            })
          : await chargeMarketplaceOrderWithSavedPaymentMethod({
              buyerId: args.buyerId,
              orderId: failureRow.orderId,
              paymentMethodId: recoveryPmId,
            });
    logRecoveryChargeResult(
      { failureId: failureRow.id, orderId: failureRow.orderId, paymentMethodId: recoveryPmId },
      charge,
    );
  } else if (failureRow.variantPurchaseId) {
    const reopen = await reopenVariantPurchaseForRecovery({
      purchaseId: failureRow.variantPurchaseId,
      buyerId: args.buyerId,
    });
    reopenedForRecovery = reopen.reopened;
    reopenReason = reopen.reason ?? null;
    if (!reopen.reopened) {
      const reason =
        reopen.reason === "SPOT_UNAVAILABLE"
          ? "That spot is no longer available — pick another team or ask the host to cancel this retry."
          : reopen.reason === "ROOM_NOT_LIVE"
            ? "This room is not live."
            : reopen.reason === "PURCHASES_LOCKED"
              ? "Purchases are locked for this room."
              : "This spot purchase cannot be retried — ask the host to cancel the retry, then claim the spot again.";
      const updated = await recordLiveRoomPaymentFailure({
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        kind: failureRow.kind,
        liveRoomItemId: failureRow.liveRoomItemId,
        orderId: failureRow.orderId,
        variantPurchaseId: failureRow.variantPurchaseId,
        breakSpotId: failureRow.breakSpotId,
        amountUsd: failureRow.amountUsd,
        status: "payment_failed",
        failureReason: reason,
        itemTitle: failureRow.itemTitle,
        buyerUsername: failureRow.buyerUsername,
      });
      return {
        ok: false,
        error: reason,
        code: reopen.reason ?? "REOPEN_FAILED",
        paymentFailure: updated,
        debug: {
          failureId: failureRow.id,
          orderId: failureRow.orderId,
          variantPurchaseId: failureRow.variantPurchaseId,
          breakSpotId: failureRow.breakSpotId,
          paymentMethodId: recoveryPmId,
          outcome: "error",
          code: reopen.reason ?? "REOPEN_FAILED",
          paymentIntentId: null,
          reachedStripe: false,
          reopened: false,
          reopenReason: reopen.reason ?? null,
          stripeError: null,
        },
      };
    }
    const purchaseCharge = await chargeLiveItemVariantPurchaseWithSavedCard({
      buyerId: args.buyerId,
      purchaseId: failureRow.variantPurchaseId,
      paymentMethodId: recoveryPmId,
    });
    logRecoveryChargeResult(
      {
        failureId: failureRow.id,
        variantPurchaseId: failureRow.variantPurchaseId,
        paymentMethodId: recoveryPmId,
      },
      purchaseCharge,
    );
    if (purchaseCharge.outcome === "paid") {
      await finalizeLiveItemVariantPurchasePaid(failureRow.variantPurchaseId, purchaseCharge.paymentIntentId);
      emitLiveRoomQueueItemsChanged(args.liveRoomId);
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
    if (purchaseCharge.outcome === "requires_action") {
      return {
        ok: true,
        requiresAction: true,
        clientSecret: purchaseCharge.clientSecret,
        paymentIntentId: purchaseCharge.paymentIntentId,
      };
    }
    if (purchaseCharge.outcome === "processing") {
      return { ok: true, processing: true };
    }
    charge = {
      outcome: "error",
      code: purchaseCharge.code,
      message: "message" in purchaseCharge ? purchaseCharge.message : undefined,
      fulfillmentDetail:
        "fulfillmentDetail" in purchaseCharge ? purchaseCharge.fulfillmentDetail : undefined,
    };
  } else if (failureRow.breakSpotId) {
    const spotCharge = await chargeBreakSpotWithSavedCard({
      buyerId: args.buyerId,
      breakSpotId: failureRow.breakSpotId,
      paymentMethodId: recoveryPmId,
    });
    logRecoveryChargeResult(
      { failureId: failureRow.id, breakSpotId: failureRow.breakSpotId, paymentMethodId: recoveryPmId },
      spotCharge,
    );
    if (spotCharge.outcome === "paid") {
      await finalizeBreakSpotPaid({ breakSpotId: failureRow.breakSpotId, paymentIntentId: spotCharge.paymentIntentId });
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
    if (spotCharge.outcome === "requires_action") {
      return {
        ok: true,
        requiresAction: true,
        clientSecret: spotCharge.clientSecret,
        paymentIntentId: spotCharge.paymentIntentId,
      };
    }
    if (spotCharge.outcome === "processing") {
      return { ok: true, processing: true };
    }
    charge = { outcome: "error", code: spotCharge.code };
  } else {
    return {
      ok: false,
      error: "This payment cannot be retried automatically yet.",
      code: "UNSUPPORTED_KIND",
      paymentFailure: serializeBuyerFailure(failureRow)!,
    };
  }

  if (!charge) {
    return {
      ok: false,
      error: "Retry failed.",
      code: "CHARGE_FAILED",
      paymentFailure: serializeBuyerFailure(failureRow)!,
    };
  }

  if (charge.outcome === "paid") {
    await resolveLiveRoomPaymentFailure({
      failureId: failureRow.id,
      liveRoomId: args.liveRoomId,
      buyerId: args.buyerId,
      buyerUsername: failureRow.buyerUsername,
    });
    return { ok: true, paid: true };
  }

  if (charge.outcome === "requires_action") {
    await prisma.liveRoomPaymentFailure.update({
      where: { id: failureRow.id },
      data: { status: "recovery_pending", failureReason: chargeOutcomeToFailureReason(charge) },
    });
    return {
      ok: true,
      requiresAction: true,
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
    };
  }

  if (charge.outcome === "processing") {
    return { ok: true, processing: true };
  }

  const updated = await recordLiveRoomPaymentFailure({
    liveRoomId: args.liveRoomId,
    buyerId: args.buyerId,
    kind: failureRow.kind,
    liveRoomItemId: failureRow.liveRoomItemId,
    orderId: failureRow.orderId,
    variantPurchaseId: failureRow.variantPurchaseId,
    breakSpotId: failureRow.breakSpotId,
    amountUsd: failureRow.amountUsd,
    status: "payment_failed",
    failureReason: chargeOutcomeToFailureReason(charge),
    itemTitle: failureRow.itemTitle,
    buyerUsername: failureRow.buyerUsername,
  });

  const chargeCode = charge.outcome === "error" ? charge.code : null;
  return {
    ok: false,
    error: updated.failureReason ?? "Payment failed. Update your payment method and try again.",
    code: chargeCode ?? "PAYMENT_FAILED",
    paymentFailure: updated,
    debug: {
      failureId: failureRow.id,
      orderId: failureRow.orderId,
      variantPurchaseId: failureRow.variantPurchaseId,
      breakSpotId: failureRow.breakSpotId,
      paymentMethodId: recoveryPmId,
      outcome: charge.outcome,
      code: chargeCode,
      // At this point the charge has resolved to an error (paid/requires_action/processing returned
      // earlier), so there is no PaymentIntent id to surface.
      paymentIntentId: null,
      reachedStripe: chargeOutcomeReachedStripe(charge.outcome, chargeCode),
      reopened: reopenedForRecovery,
      reopenReason,
      stripeError: charge.stripeDebug ?? null,
      fulfillmentDetail:
        charge.outcome === "error" && "fulfillmentDetail" in charge
          ? charge.fulfillmentDetail ?? null
          : null,
    },
  };
}

export async function syncLiveRoomPaymentFailureAfterSca(args: {
  liveRoomId: string;
  buyerId: string;
  failureId?: string;
}): Promise<
  | { ok: true; paid: true }
  | { ok: false; error: string; paymentFailure: LiveBuyerPaymentFailureDTO | null }
> {
  const failureRow = await prisma.liveRoomPaymentFailure.findFirst({
    where: {
      liveRoomId: args.liveRoomId,
      buyerId: args.buyerId,
      status: { in: UNRESOLVED_STATUSES },
      ...(args.failureId ? { id: args.failureId } : {}),
    },
    orderBy: { failedAt: "desc" },
  });
  if (!failureRow) return { ok: true, paid: true };

  if (failureRow.variantPurchaseId) {
    const sync = await syncLiveItemVariantPurchasePaymentIntent({
      buyerId: args.buyerId,
      purchaseId: failureRow.variantPurchaseId,
    });
    if (sync.outcome === "paid") {
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
  }

  if (failureRow.breakSpotId) {
    const sync = await syncBreakSpotPaymentIntent({
      buyerId: args.buyerId,
      breakSpotId: failureRow.breakSpotId,
    });
    if (sync.outcome === "paid") {
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
  }

  if (failureRow.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: failureRow.orderId, buyerId: args.buyerId },
      select: { paymentStatus: true, listing: { select: { buyingFormat: true } } },
    });
    if (order?.paymentStatus === "paid") {
      await resolveLiveRoomPaymentFailure({
        failureId: failureRow.id,
        liveRoomId: args.liveRoomId,
        buyerId: args.buyerId,
        buyerUsername: failureRow.buyerUsername,
      });
      return { ok: true, paid: true };
    }
    if (failureRow.kind === "buy_now" && failureRow.liveRoomItemId) {
      const sync = await syncLiveBuyNowOrderPaymentIntent({
        buyerId: args.buyerId,
        orderId: failureRow.orderId,
        liveRoomId: args.liveRoomId,
        liveRoomItemId: failureRow.liveRoomItemId,
      });
      if (sync.outcome === "paid") {
        await resolveLiveRoomPaymentFailure({
          failureId: failureRow.id,
          liveRoomId: args.liveRoomId,
          buyerId: args.buyerId,
          buyerUsername: failureRow.buyerUsername,
        });
        return { ok: true, paid: true };
      }
    }
  }

  const dto = serializeBuyerFailure(failureRow);
  return {
    ok: false,
    error: "Payment not completed yet.",
    paymentFailure: dto,
  };
}

/** Host dismisses a stuck payment retry — releases held variant spot and unblocks the buyer. */
export async function cancelLiveRoomPaymentFailureBySeller(args: {
  liveRoomId: string;
  sellerId: string;
  failureId: string;
}): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (!room) return { ok: false, error: "Room not found.", code: "NOT_FOUND" };
  if (room.sellerId !== args.sellerId) {
    return { ok: false, error: "Only the host can cancel this payment retry.", code: "FORBIDDEN" };
  }

  const failure = await prisma.liveRoomPaymentFailure.findFirst({
    where: {
      id: args.failureId,
      liveRoomId: args.liveRoomId,
      status: { in: UNRESOLVED_STATUSES },
    },
  });
  if (!failure) return { ok: false, error: "Payment retry not found or already resolved.", code: "NOT_FOUND" };

  if (failure.variantPurchaseId) {
    const purchase = await prisma.liveItemVariantPurchase.findUnique({
      where: { id: failure.variantPurchaseId },
      select: { paymentStatus: true },
    });
    if (purchase?.paymentStatus === "pending_payment") {
      await releaseVariantPurchaseOnCheckoutExpired(failure.variantPurchaseId);
    }
  }

  await prisma.liveRoomPaymentFailure.delete({ where: { id: failure.id } });
  emitLiveRoomQueueItemsChanged(args.liveRoomId);
  return { ok: true };
}
