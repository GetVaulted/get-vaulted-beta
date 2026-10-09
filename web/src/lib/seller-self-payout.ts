import { planLumpPayoutCents } from "@/lib/admin/bank-payout-pushable";
import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { listOrdersReadyForAdminBankPayout } from "@/lib/admin/orders-ready-for-bank-payout";
import { releaseSellerLumpBankPayout } from "@/lib/admin/release-seller-lump-payout";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { orderLooksShippedForBankPayout } from "@/services/payout/stripe-seller-payout";

/**
 * Seller-initiated "Initiate Payout": the seller pushes their own Stripe Connect -> bank payout instead of
 * waiting for an admin to do it by hand. It sends ONE lump-sum Stripe payout for the seller's whole sendable
 * balance (not one small payout per order), with the same money-safety rules as the admin path (shipped, label
 * cost already recovered, oldest first, never more than the live Connect available balance, idempotent), plus:
 *  - the rest of a live show must have shipped (admins can override that, sellers cannot),
 *  - a minimum amount ($100),
 *  - one payout per seller per 24 hours,
 *  - an alert to admins every time one goes out.
 */

export const SELLER_SELF_PAYOUT_MIN_USD = 100;
export const SELLER_SELF_PAYOUT_COOLDOWN_MS = 24 * 60 * 60_000;
export const SELLER_SELF_PAYOUT_AUDIT_ACTION = "seller_self_payout_initiated";

export type SellerSelfPayoutState =
  | "ready"
  | "nothing_ready"
  | "below_minimum"
  | "cooldown"
  | "blocked";

export type SellerSelfPayoutSummary = {
  state: SellerSelfPayoutState;
  canInitiate: boolean;
  /** Plain-language line the seller sees under the button. */
  message: string;
  /** Machine reason when `state` is `blocked` (e.g. `stripe_onboarding_incomplete`). */
  blockedReason: string | null;
  /** Orders that are shipped and ready, before the balance limit. */
  readyOrderCount: number;
  readyUsd: number;
  /** Money in the seller's Stripe balance that can leave today. Null when unknown. */
  availableUsd: number | null;
  /** Exactly what a tap would send now (oldest orders first, within the available balance). */
  payableUsd: number;
  /** Stripe balance that is NOT sendable yet (e.g. its order hasn't shipped). Zero when unknown. */
  waitingUsd: number;
  payableOrderCount: number;
  minimumUsd: number;
  cooldownEndsAt: string | null;
};

function usdBalanceCents(buckets: Array<{ amount: number; currency: string }> | undefined): number {
  if (!buckets?.length) return 0;
  return buckets.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0);
}

function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Pure: what one lump payout would send for these orders (oldest first) within this available balance:
 * every order that fully fits plus the leftover balance up to the next order.
 */
export function planSelfPayout(args: {
  ordersOldestFirst: Array<{ orderId: string; estimatedNetUsd: number }>;
  availableUsdCents: number;
}): { payableOrderIds: string[]; payableCents: number } {
  const lump = planLumpPayoutCents({
    ordersOldestFirst: args.ordersOldestFirst.map((o) => ({
      orderId: o.orderId,
      estimatedNetUsdCents: Math.round(o.estimatedNetUsd * 100),
    })),
    availableUsdCents: args.availableUsdCents,
  });
  return { payableOrderIds: lump.coveredOrderIds, payableCents: lump.lumpCents };
}

/** Pure: the button state from the numbers. Order of checks is the order a seller should fix things in. */
export function decideSelfPayoutState(args: {
  blockedReason: string | null;
  readyOrderCount: number;
  payableCents: number;
  minimumCents: number;
  cooldownEndsAt: Date | null;
  now: Date;
}): { state: SellerSelfPayoutState; canInitiate: boolean } {
  if (args.blockedReason) return { state: "blocked", canInitiate: false };
  if (args.cooldownEndsAt && args.cooldownEndsAt.getTime() > args.now.getTime()) {
    return { state: "cooldown", canInitiate: false };
  }
  if (args.readyOrderCount === 0 || args.payableCents <= 0) {
    return { state: "nothing_ready", canInitiate: false };
  }
  if (args.payableCents < args.minimumCents) return { state: "below_minimum", canInitiate: false };
  return { state: "ready", canInitiate: true };
}

function blockedMessage(reason: string): string {
  switch (reason) {
    case "no_stripe_account":
    case "stripe_onboarding_incomplete":
      return "Finish connecting your bank in Seller HQ to get paid.";
    case "stripe_payouts_disabled":
      return "Stripe has paused payouts on your account. Open Seller HQ to see what Stripe needs from you.";
    default:
      return "Payouts are temporarily unavailable. Try again in a few minutes.";
  }
}

async function findCooldownEndsAt(sellerId: string, now: Date): Promise<Date | null> {
  const since = new Date(now.getTime() - SELLER_SELF_PAYOUT_COOLDOWN_MS);
  const last = await prisma.payoutEligibilityAuditLog.findFirst({
    where: { sellerId, action: SELLER_SELF_PAYOUT_AUDIT_ACTION, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last ? new Date(last.createdAt.getTime() + SELLER_SELF_PAYOUT_COOLDOWN_MS) : null;
}

/** Orders that belong to a live show whose other orders have not all shipped yet are held back. */
async function dropOrdersWaitingOnLiveShow<T extends { orderId: string; liveShippingSessionId: string | null }>(
  orders: T[],
): Promise<T[]> {
  const sessionIds = [...new Set(orders.map((o) => o.liveShippingSessionId).filter((id): id is string => !!id))];
  if (sessionIds.length === 0) return orders;
  const siblings = await prisma.order.findMany({
    where: { liveShippingSessionId: { in: sessionIds }, paymentStatus: "paid", status: { not: "cancelled" } },
    select: {
      liveShippingSessionId: true,
      shippedAt: true,
      carrierAcceptedAt: true,
      fulfillmentStatus: true,
      status: true,
    },
  });
  const blocked = new Set<string>();
  for (const s of siblings) {
    if (s.liveShippingSessionId && !orderLooksShippedForBankPayout(s)) blocked.add(s.liveShippingSessionId);
  }
  return orders.filter((o) => !o.liveShippingSessionId || !blocked.has(o.liveShippingSessionId));
}

export async function getSellerSelfPayoutSummary(
  sellerId: string,
  now: Date = new Date(),
): Promise<SellerSelfPayoutSummary> {
  const base: SellerSelfPayoutSummary = {
    state: "nothing_ready",
    canInitiate: false,
    message: "",
    blockedReason: null,
    readyOrderCount: 0,
    readyUsd: 0,
    availableUsd: null,
    payableUsd: 0,
    waitingUsd: 0,
    payableOrderCount: 0,
    minimumUsd: SELLER_SELF_PAYOUT_MIN_USD,
    cooldownEndsAt: null,
  };
  const blocked = (reason: string): SellerSelfPayoutSummary => ({
    ...base,
    state: "blocked",
    blockedReason: reason,
    message: blockedMessage(reason),
  });

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true, stripePayoutsEnabled: true },
  });
  const accountId = seller?.stripeAccountId?.trim();
  if (!accountId) return blocked("no_stripe_account");
  if (!seller?.stripeOnboardingComplete) return blocked("stripe_onboarding_incomplete");
  if (seller.stripePayoutsEnabled === false) return blocked("stripe_payouts_disabled");
  if (!isStripeConfigured()) return blocked("stripe_not_configured");

  const allReady = await listOrdersReadyForAdminBankPayout(1000, { sellerId });
  const orders = (await dropOrdersWaitingOnLiveShow(allReady)).sort((a, b) => {
    const aT = Date.parse(a.shippedAt ?? a.createdAt);
    const bT = Date.parse(b.shippedAt ?? b.createdAt);
    return aT !== bT ? aT - bT : a.orderId.localeCompare(b.orderId);
  });
  const readyUsd = Math.round(orders.reduce((sum, o) => sum + o.estimatedNetUsd, 0) * 100) / 100;

  let availableCents: number;
  try {
    const balance = await getStripe().balance.retrieve({ stripeAccount: accountId });
    availableCents = usdBalanceCents(balance.available);
  } catch (e) {
    console.warn("[seller-self-payout] balance lookup failed", {
      sellerId,
      error: e instanceof Error ? e.message : String(e),
    });
    return blocked("stripe_balance_error");
  }

  const plan = planSelfPayout({ ordersOldestFirst: orders, availableUsdCents: availableCents });
  const cooldownEndsAt = await findCooldownEndsAt(sellerId, now);
  const { state, canInitiate } = decideSelfPayoutState({
    blockedReason: null,
    readyOrderCount: orders.length,
    payableCents: plan.payableCents,
    minimumCents: Math.round(SELLER_SELF_PAYOUT_MIN_USD * 100),
    cooldownEndsAt,
    now,
  });

  const payableUsd = plan.payableCents / 100;
  const waitingUsd = Math.max(0, Math.round(availableCents - plan.payableCents)) / 100;
  const waitingNote =
    waitingUsd >= 0.01 ? ` ${money(waitingUsd)} more is in your Stripe balance and unlocks as those orders ship.` : "";
  const message =
    state === "ready"
      ? `${money(payableUsd)} will be sent to your bank. Banks usually show it in 1-2 business days.`
      : state === "cooldown"
        ? "You can take one payout per day, and you already took one in the last 24 hours."
        : state === "below_minimum"
          ? `Payouts start at ${money(SELLER_SELF_PAYOUT_MIN_USD)}. You have ${money(payableUsd)} ready.${waitingNote}`
          : orders.length > 0
            ? "Your earnings are still clearing into your Stripe balance. Check back soon."
            : `Nothing is ready to send yet. Money can be sent once its order has shipped.${waitingNote}`;

  return {
    ...base,
    state,
    canInitiate,
    message,
    readyOrderCount: orders.length,
    readyUsd,
    availableUsd: availableCents / 100,
    payableUsd,
    waitingUsd,
    payableOrderCount: plan.payableOrderIds.length,
    cooldownEndsAt: cooldownEndsAt?.toISOString() ?? null,
  };
}

export type SellerSelfPayoutResult =
  | {
      ok: true;
      paidUsd: number;
      paidOrderCount: number;
      /** Orders that could not go out this time (still waiting, not an error for the seller). */
      heldOrderCount: number;
      message: string;
    }
  | { ok: false; code: SellerSelfPayoutState | "failed"; message: string; cooldownEndsAt?: string | null };

/**
 * Claim the cooldown slot. The advisory lock is held only for this short check-and-insert, so two taps at the
 * same moment cannot both pass. (Money safety does not rely on this: Stripe payouts are idempotent per order.)
 */
async function claimSelfPayoutSlot(
  sellerId: string,
  now: Date,
): Promise<{ claimId: string } | { cooldownEndsAt: Date }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller_self_payout:${sellerId}`}))`;
    const since = new Date(now.getTime() - SELLER_SELF_PAYOUT_COOLDOWN_MS);
    const recent = await tx.payoutEligibilityAuditLog.findFirst({
      where: { sellerId, action: SELLER_SELF_PAYOUT_AUDIT_ACTION, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (recent) return { cooldownEndsAt: new Date(recent.createdAt.getTime() + SELLER_SELF_PAYOUT_COOLDOWN_MS) };
    const row = await tx.payoutEligibilityAuditLog.create({
      data: {
        sellerId,
        action: SELLER_SELF_PAYOUT_AUDIT_ACTION,
        reason: "Seller started a payout (in progress)",
      },
      select: { id: true },
    });
    return { claimId: row.id };
  });
}

export async function initiateSellerSelfPayout(sellerId: string): Promise<SellerSelfPayoutResult> {
  const now = new Date();
  const summary = await getSellerSelfPayoutSummary(sellerId, now);
  if (!summary.canInitiate) {
    return { ok: false, code: summary.state, message: summary.message, cooldownEndsAt: summary.cooldownEndsAt };
  }

  const claim = await claimSelfPayoutSlot(sellerId, now);
  if ("cooldownEndsAt" in claim) {
    return {
      ok: false,
      code: "cooldown",
      message: "You can take one payout per day, and you already took one in the last 24 hours.",
      cooldownEndsAt: claim.cooldownEndsAt.toISOString(),
    };
  }

  let release: Awaited<ReturnType<typeof releaseSellerLumpBankPayout>>;
  try {
    release = await releaseSellerLumpBankPayout({
      sellerId,
      adminId: null,
      reason: "Seller-initiated payout",
      force: false,
    });
  } catch (e) {
    console.error("[seller-self-payout] release failed", e);
    await prisma.payoutEligibilityAuditLog.delete({ where: { id: claim.claimId } }).catch(() => undefined);
    return { ok: false, code: "failed", message: "We couldn't start your payout. Please try again in a few minutes." };
  }

  if (release.totalPaidUsd <= 0 && release.pushed === 0) {
    // Nothing left the platform, so don't burn the seller's cooldown.
    await prisma.payoutEligibilityAuditLog.delete({ where: { id: claim.claimId } }).catch(() => undefined);
    return {
      ok: false,
      code: release.failed > 0 ? "failed" : "nothing_ready",
      message:
        release.failed > 0
          ? "We couldn't send this payout. Nothing was taken from your balance. Please try again later or contact support."
          : "Nothing was ready to send right now.",
    };
  }

  await prisma.payoutEligibilityAuditLog
    .update({
      where: { id: claim.claimId },
      data: {
        reason: `Seller-initiated lump payout: ${money(release.totalPaidUsd)} (${release.pushed} order(s) settled)${release.payoutId ? `, ${release.payoutId}` : ""}`,
      },
    })
    .catch(() => undefined);

  const handle = (
    await prisma.user.findUnique({ where: { id: sellerId }, select: { username: true } }).catch(() => null)
  )?.username;
  scheduleNotifyAdmins({
    type: "admin_seller_self_payout",
    title: `Seller payout · @${handle?.trim() || sellerId.slice(0, 8)}`,
    body: `${handle?.trim() ? `@${handle.trim()}` : "A seller"} took their own payout: ${money(release.totalPaidUsd)} in one payout (${release.pushed} order(s) settled).`,
    href: `/admin/payouts`,
    dedupeKey: `admin_seller_self_payout:${claim.claimId}`,
  });

  const held = release.skipped + release.failed;
  return {
    ok: true,
    paidUsd: release.totalPaidUsd,
    paidOrderCount: release.pushed,
    heldOrderCount: held,
    message:
      `${money(release.totalPaidUsd)} is on its way to your bank.` +
      (held > 0 ? ` ${held} other order${held === 1 ? " is" : "s are"} still waiting and will be available later.` : ""),
  };
}
