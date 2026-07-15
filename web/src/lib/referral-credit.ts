import { Prisma } from "@/generated/prisma/client";
import { OrderPaymentMethod, ReferralCreditRole, ReferralCreditStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { ensureUserReferralCode, resolveReferrerIdFromReferralInput } from "@/lib/referral-code";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "@/lib/order-refund-eligibility";
import { normalizeAddressKey, normalizeEmailForComparison } from "@/lib/identity-normalize";

/**
 * Referral credit program (2026-07).
 *
 * Rules (product decision, see chat 2026-07-05):
 * - Trigger: the referred friend's FIRST completed paid order, $25+ subtotal.
 * - Reward: flat $10 to the referrer, flat $10 to the referee (both sides), on that one order.
 * - Funding: pure marketing expense. Never reduces the seller's proceeds or the platform fee —
 *   it is applied purely as a buyer-side discount on top of whatever the buyer would have paid,
 *   and is never subtracted from what gets transferred to the seller.
 * - Scope: Stripe-processed marketplace flows only (Buy Now, Offers, live auctions/Vault Drop,
 *   layaway deposits). Escrow (Trustap) orders are excluded from both earning and spending —
 *   that's a separate payment rail this program doesn't reconcile against.
 * - Hold: credit sits `pending` until the qualifying order's own return/dispute window has
 *   closed (mirrors buyer-protection windows elsewhere), so a fast refund/chargeback can still
 *   claw it back before it's spendable.
 * - Guardrails v1: one referral attribution per account for life (immutable, set only at account
 *   creation or OAuth profile setup), plus a same-household self-referral heuristic (see `isLikelySelfReferral`).
 *
 * Share links use each member's secret `User.referralCode` (not their public username). Legacy
 * `?ref=<username>` links still resolve during transition (`web/src/lib/referral-code.ts`).
 */

export const REFERRAL_CREDIT_AMOUNT_USD = 10;
export const REFERRAL_MIN_QUALIFYING_ORDER_USD = 25;
export const REFERRAL_CREDIT_HOLD_DAYS = 14;
const HOLD_MS = REFERRAL_CREDIT_HOLD_DAYS * 24 * 60 * 60 * 1000;
/** Safety net: an in-flight checkout reservation that's sat this long without being committed or
 *  released (crashed process, abandoned tab) is treated as abandoned and returned to the pool. */
const STALE_RESERVATION_MS = 24 * 60 * 60 * 1000;

/**
 * Cheap, DB-only self-referral heuristic — deliberately conservative (false negatives are fine,
 * false positives just mean a legitimate referral gets voided, which is recoverable by an admin
 * reviewing `ReferralCredit.voidReason`). Catches the two most common cheap-alt-account patterns:
 * a Gmail dot/plus alias of the referrer's own email, or the referred order shipping to an
 * address the referrer has shipped to before.
 */
async function isLikelySelfReferral(
  referrerId: string,
  refereeOrder: { shipAddress: string; shipZip: string; buyerEmail: string },
): Promise<boolean> {
  const referrer = await prisma.user.findUnique({ where: { id: referrerId }, select: { email: true } });
  if (!referrer) return false;
  if (normalizeEmailForComparison(referrer.email) === normalizeEmailForComparison(refereeOrder.buyerEmail)) {
    return true;
  }
  const refereeKey = normalizeAddressKey(refereeOrder.shipAddress, refereeOrder.shipZip);
  const referrerOrders = await prisma.order.findMany({
    where: { buyerId: referrerId },
    select: { shipAddress: true, shipZip: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return referrerOrders.some((o) => normalizeAddressKey(o.shipAddress, o.shipZip) === refereeKey);
}

/**
 * Attribute a brand-new account to a referrer from a `?ref=` signup link. Only ever
 * called once, immediately after the Prisma `User` row is created (mobile: `AuthSignUpScreen` →
 * Supabase metadata; web: `registerAccountViaSupabaseAuth`) — both funnel through
 * `ensurePrismaUserForSupabaseAuth`, which is the single place this is invoked from. The
 * `referredById: null` guard makes this idempotent/safe even if called more than once.
 */
export async function attributeReferralOnSignup(
  newUserId: string,
  rawReferralCode: string | null | undefined,
): Promise<void> {
  try {
    const referrerId = await resolveReferrerIdFromReferralInput(rawReferralCode);
    if (!referrerId || referrerId === newUserId) return;
    await prisma.user.updateMany({
      where: { id: newUserId, referredById: null },
      data: { referredById: referrerId, referredAt: new Date() },
    });
  } catch (e) {
    console.error("[referral-credit] attributeReferralOnSignup failed", { newUserId, error: e });
  }
}

/**
 * Called from `finalizeStripeMarketplaceOrderPaid` (the shared finalize path for marketplace
 * Buy Now / Offers / live-auction / Vault Drop orders) once an order is confirmed paid. Fully
 * best-effort and non-throwing — a referral bug must never block or roll back a real payment.
 * Idempotent via the `@@unique([sourceOrderId, role])` constraint, so safe on webhook replay.
 */
export async function grantReferralCreditsForQualifyingOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        totalUsd: true,
        createdAt: true,
        paymentMethod: true,
        shipAddress: true,
        shipZip: true,
        buyer: { select: { id: true, email: true, referredById: true } },
      },
    });
    if (!order || !order.buyer.referredById) return;
    if (order.paymentMethod === OrderPaymentMethod.escrow) return;
    if (order.totalUsd < REFERRAL_MIN_QUALIFYING_ORDER_USD) return;

    const referrerId = order.buyer.referredById;
    if (referrerId === order.buyerId) return;

    // Cheap short-circuit for "first qualifying order only" — the real guarantee is the DB
    // unique index below, this just avoids extra work (self-referral check, transaction) on
    // every subsequent order once a referee has already been credited once.
    const existingReferee = await prisma.referralCredit.findFirst({
      where: { userId: order.buyerId, role: ReferralCreditRole.referee },
      select: { id: true },
    });
    if (existingReferee) return;

    const selfReferral = await isLikelySelfReferral(referrerId, {
      shipAddress: order.shipAddress,
      shipZip: order.shipZip,
      buyerEmail: order.buyer.email,
    });
    const availableAt = new Date(order.createdAt.getTime() + HOLD_MS);
    const now = new Date();
    const initialStatus = selfReferral ? ReferralCreditStatus.voided : ReferralCreditStatus.pending;
    const voidFields = selfReferral
      ? { voidedAt: now, voidReason: "self_referral_suspected" as const }
      : {};

    await prisma.$transaction(async (tx) => {
      await tx.referralCredit.create({
        data: {
          userId: referrerId,
          role: ReferralCreditRole.referrer,
          amountUsd: REFERRAL_CREDIT_AMOUNT_USD,
          sourceOrderId: order.id,
          availableAt,
          status: initialStatus,
          ...voidFields,
        },
      });
      await tx.referralCredit.create({
        data: {
          userId: order.buyerId,
          role: ReferralCreditRole.referee,
          amountUsd: REFERRAL_CREDIT_AMOUNT_USD,
          sourceOrderId: order.id,
          availableAt,
          status: initialStatus,
          ...voidFields,
        },
      });
    });

    if (selfReferral) {
      console.warn("[referral-credit] self-referral suspected, credit voided at grant time", {
        orderId,
        referrerId,
        refereeId: order.buyerId,
      });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    console.error("[referral-credit] grantReferralCreditsForQualifyingOrder failed", { orderId, error: e });
  }
}

/**
 * Flips `pending` credits past their hold window to `available`, or `voided` if the source order
 * was refunded first. Credits whose source order has an active (unresolved) refund request stay
 * `pending` and are re-checked next call. Safe to call liberally — cheap no-op when nothing is due.
 */
export async function promoteDueReferralCredits(userId: string): Promise<void> {
  const now = new Date();
  const due = await prisma.referralCredit.findMany({
    where: { userId, status: ReferralCreditStatus.pending, availableAt: { lte: now } },
    select: { id: true, sourceOrderId: true },
  });
  if (due.length === 0) return;

  const orderIds = [...new Set(due.map((d) => d.sourceOrderId))];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, paymentStatus: true, refundRequests: { select: { status: true } } },
  });
  const orderById = new Map(orders.map((o) => [o.id, o]));

  for (const credit of due) {
    const order = orderById.get(credit.sourceOrderId);
    if (!order) continue;
    if (order.paymentStatus === "refunded") {
      await prisma.referralCredit.updateMany({
        where: { id: credit.id, status: ReferralCreditStatus.pending },
        data: { status: ReferralCreditStatus.voided, voidedAt: now, voidReason: "source_order_refunded" },
      });
      continue;
    }
    const hasActiveRefundRequest = order.refundRequests.some((r) => ACTIVE_REFUND_REQUEST_STATUSES.has(r.status));
    if (hasActiveRefundRequest) continue;
    await prisma.referralCredit.updateMany({
      where: { id: credit.id, status: ReferralCreditStatus.pending },
      data: { status: ReferralCreditStatus.available },
    });
  }
}

/** Returns stale (crashed/abandoned) checkout reservations to the available pool. */
async function releaseStaleReservations(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RESERVATION_MS);
  await prisma.referralCredit.updateMany({
    where: { userId, status: ReferralCreditStatus.reserved, reservedAt: { lte: cutoff } },
    data: { status: ReferralCreditStatus.available, reservedForRef: null, reservedAt: null },
  });
}

export async function getAvailableReferralCreditUsd(userId: string): Promise<number> {
  await releaseStaleReservations(userId);
  await promoteDueReferralCredits(userId);
  const agg = await prisma.referralCredit.aggregate({
    where: { userId, status: ReferralCreditStatus.available },
    _sum: { amountUsd: true },
  });
  return agg._sum.amountUsd ?? 0;
}

export type ReferralSummary = {
  referralCode: string;
  availableUsd: number;
  pendingUsd: number;
  successfulReferrals: number;
};

/** Full referral snapshot for the wallet UI + "your referral link" screen. */
export async function getUserReferralSummary(userId: string): Promise<ReferralSummary> {
  await releaseStaleReservations(userId);
  await promoteDueReferralCredits(userId);
  const [referralCode, availableAgg, pendingAgg, referralCount] = await Promise.all([
    ensureUserReferralCode(userId),
    prisma.referralCredit.aggregate({
      where: { userId, status: ReferralCreditStatus.available },
      _sum: { amountUsd: true },
    }),
    prisma.referralCredit.aggregate({
      where: { userId, status: ReferralCreditStatus.pending },
      _sum: { amountUsd: true },
    }),
    prisma.referralCredit.count({
      where: { userId, role: ReferralCreditRole.referrer, status: { not: ReferralCreditStatus.voided } },
    }),
  ]);
  return {
    referralCode,
    availableUsd: availableAgg._sum.amountUsd ?? 0,
    pendingUsd: pendingAgg._sum.amountUsd ?? 0,
    successfulReferrals: referralCount,
  };
}

/**
 * Reserve up to `maxApplyUsd` of available referral credit against an in-flight checkout, in
 * whole per-referral increments (all credit rows are the same flat amount in v1, so this never
 * needs to split a row or overshoot the cap). Returns the amount actually reserved — always
 * `<= maxApplyUsd`, and callers must treat a `0` return as "no credit applied" rather than error.
 * Pair with exactly one of `commitReferralCreditReservation` (checkout succeeded) or
 * `releaseReferralCreditReservation` (checkout failed/expired/abandoned) using the same `checkoutRef`.
 */
export async function reserveReferralCreditForCheckout(
  userId: string,
  maxApplyUsd: number,
  checkoutRef: string,
): Promise<number> {
  if (maxApplyUsd <= 0 || !checkoutRef) return 0;
  await releaseStaleReservations(userId);
  await promoteDueReferralCredits(userId);

  const available = await prisma.referralCredit.findMany({
    where: { userId, status: ReferralCreditStatus.available },
    orderBy: { createdAt: "asc" },
    select: { id: true, amountUsd: true },
  });

  let remaining = maxApplyUsd;
  const candidateIds: string[] = [];
  for (const credit of available) {
    if (credit.amountUsd > remaining) continue;
    candidateIds.push(credit.id);
    remaining -= credit.amountUsd;
    if (remaining <= 0) break;
  }
  if (candidateIds.length === 0) return 0;

  // `updateMany` with a `status: available` guard makes this safe against a concurrent checkout
  // racing to reserve the same rows — whichever request wins the row keeps it, the loser just
  // reserves less than it hoped for (never double-applies the same credit).
  await prisma.referralCredit.updateMany({
    where: { id: { in: candidateIds }, status: ReferralCreditStatus.available },
    data: { status: ReferralCreditStatus.reserved, reservedForRef: checkoutRef, reservedAt: new Date() },
  });

  const claimed = await prisma.referralCredit.findMany({
    where: { id: { in: candidateIds }, status: ReferralCreditStatus.reserved, reservedForRef: checkoutRef },
    select: { amountUsd: true },
  });
  return claimed.reduce((sum, c) => sum + c.amountUsd, 0);
}

/** Checkout completed successfully — permanently spend the reserved credit against the order. */
export async function commitReferralCreditReservation(checkoutRef: string, spentOrderId: string): Promise<void> {
  if (!checkoutRef) return;
  await prisma.referralCredit.updateMany({
    where: { reservedForRef: checkoutRef, status: ReferralCreditStatus.reserved },
    data: { status: ReferralCreditStatus.spent, spentOrderId, spentAt: new Date() },
  });
}

/** Checkout failed, expired, or was abandoned — return the reserved credit to the available pool. */
export async function releaseReferralCreditReservation(checkoutRef: string): Promise<void> {
  if (!checkoutRef) return;
  await prisma.referralCredit.updateMany({
    where: { reservedForRef: checkoutRef, status: ReferralCreditStatus.reserved },
    data: { status: ReferralCreditStatus.available, reservedForRef: null, reservedAt: null },
  });
}
