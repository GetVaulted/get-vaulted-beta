/**
 * Buyer payment-fraud protections.
 *
 * Background (Oct 2026): a brand-new, phone-unverified account paid for $1,465 of goods with Link funded
 * by a bank account, received the items, then disputed both payments as "unauthorized debit". Bank-debit
 * disputes are effectively unwinnable for the merchant, and the seller had already been paid out, so the
 * platform absorbed the loss. These rules close each gap that let it happen:
 *
 *  1. Phone verification is required for any purchase of {@link HIGH_VALUE_PURCHASE_CENTS} or more.
 *  2. A "risky" purchase (new or unverified buyer AND at least {@link HIGH_VALUE_PURCHASE_CENTS}) is card-only:
 *     Link / Cash App / Amazon Pay / BNPL are removed, and on-session card payments must pass 3D Secure,
 *     which moves fraud-dispute liability to the card issuer.
 *  3. {@link FAILED_PAYMENT_LOCK_COUNT} failed payments within {@link FAILED_PAYMENT_LOCK_WINDOW_HOURS} hours
 *     locks the account from buying until an admin reviews it.
 *  4. Seller payouts for risky sales of {@link HIGH_VALUE_PURCHASE_CENTS} or more (new buyer, new seller, or a
 *     non-card payment) are held {@link RISKY_SALE_PAYOUT_HOLD_DAYS} days from payment, so a dispute that lands
 *     during the hold can be recovered from the seller's Connect balance (see {@link evaluateRiskySalePayoutHold}).
 *
 * Thresholds were sized against real orders (Sep 30 – Oct 30 2026, 2,625 paid orders): applying rules 1 and 4
 * to every new account would have held 46% of payouts and asked 41% of buyers for a phone; at $250+ it is
 * about 3 held payouts and 14 phone checks a month, which still covers the $1,260 fraud order.
 */

import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { PHONE_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/live-room-commerce-messages";
import { prisma } from "@/lib/prisma";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Accounts younger than this are "new buyers". */
export const NEW_BUYER_ACCOUNT_AGE_DAYS = 30;
/**
 * Purchases at or above this (cents, buyer total) need a verified phone, are card-only for new or unverified
 * buyers, and have their seller payout held when the sale is risky.
 */
export const HIGH_VALUE_PURCHASE_CENTS = 250_00;
/** A paid order only counts as buyer "history" once it is this old (past the typical dispute window). */
export const SETTLED_ORDER_AGE_DAYS = 14;
export const FAILED_PAYMENT_LOCK_COUNT = 5;
export const FAILED_PAYMENT_LOCK_WINDOW_HOURS = 24;
/** Sellers with fewer paid sales than this (before the order) are "new sellers" for payout holds. */
export const NEW_SELLER_PAID_SALES = 3;
export const RISKY_SALE_PAYOUT_HOLD_DAYS = 14;

export const PURCHASES_LOCKED_CODE = "PURCHASES_LOCKED" as const;
export const CARD_REQUIRED_CODE = "CARD_REQUIRED_FOR_PURCHASE" as const;
export const AUTO_LOCK_REASON = "auto_failed_payments";

export const PURCHASES_LOCKED_MESSAGE =
  "Purchases on your account are paused for a security review. Contact Get Vaulted support to restore access.";
export const CARD_REQUIRED_MESSAGE =
  "For your security, this purchase needs a credit or debit card (Apple Pay and Google Pay work too). Add one in Vault Wallet and try again.";

/** Wallet types that are not plain cards. Link and Cash App can be funded straight from a bank account. */
const NON_CARD_WALLET_TYPES = new Set(["link", "cash_app_pay", "cashapp", "amazon_pay", "paypal", "venmo"]);

export type BuyerRiskInput = {
  now: Date;
  accountCreatedAt: Date;
  phoneVerifiedAt: Date | null;
  purchasesLockedAt: Date | null;
  /** Buyer's paid (not refunded / charged back) orders at least {@link SETTLED_ORDER_AGE_DAYS} days old. */
  settledPaidOrders: number;
  /** Failed payments in the last {@link FAILED_PAYMENT_LOCK_WINDOW_HOURS} hours. */
  recentFailedPayments: number;
  /** Buyer total for this purchase in cents, when known. */
  amountCents: number | null;
};

export type BuyerRisk = {
  locked: boolean;
  /** True when this evaluation crossed the failed-payment threshold and the account should now be locked. */
  shouldAutoLock: boolean;
  newBuyer: boolean;
  phoneVerified: boolean;
  phoneRequired: boolean;
  /** Only cards (incl. Apple Pay / Google Pay) may pay for this purchase. */
  cardOnly: boolean;
  /** Ask for 3D Secure on every on-session card payment for this purchase. */
  force3ds: boolean;
};

export function evaluateBuyerRisk(input: BuyerRiskInput): BuyerRisk {
  const accountAgeDays = (input.now.getTime() - input.accountCreatedAt.getTime()) / DAY_MS;
  const youngAccount = accountAgeDays < NEW_BUYER_ACCOUNT_AGE_DAYS;
  const newBuyer = youngAccount || input.settledPaidOrders === 0;
  const phoneVerified = input.phoneVerifiedAt != null;
  const highValue = input.amountCents != null && input.amountCents >= HIGH_VALUE_PURCHASE_CENTS;
  const alreadyLocked = input.purchasesLockedAt != null;
  const shouldAutoLock = !alreadyLocked && input.recentFailedPayments >= FAILED_PAYMENT_LOCK_COUNT;
  const cardOnly = highValue && (newBuyer || !phoneVerified);
  return {
    locked: alreadyLocked || shouldAutoLock,
    shouldAutoLock,
    newBuyer,
    phoneVerified,
    phoneRequired: !phoneVerified && highValue,
    cardOnly,
    force3ds: cardOnly,
  };
}

export type BuyerPurchaseBlock = {
  status: number;
  error: string;
  code: typeof PURCHASES_LOCKED_CODE | "PHONE_VERIFICATION_REQUIRED";
};

/** The HTTP block for a purchase attempt, or null when the buyer may proceed. */
export function buyerPurchaseBlock(risk: BuyerRisk): BuyerPurchaseBlock | null {
  if (risk.locked) return { status: 403, error: PURCHASES_LOCKED_MESSAGE, code: PURCHASES_LOCKED_CODE };
  if (risk.phoneRequired) {
    return { status: 403, error: PHONE_VERIFICATION_REQUIRED_MESSAGE, code: "PHONE_VERIFICATION_REQUIRED" };
  }
  return null;
}

/**
 * True when a payment method of this Stripe PM type / Order wallet type is not allowed for a card-only purchase.
 * Apple Pay and Google Pay are cards (Stripe type "card", wallet types apple_pay / google_pay) and stay allowed.
 */
export function paymentMethodTypeBlockedForCardOnly(type: string | null | undefined): boolean {
  return NON_CARD_WALLET_TYPES.has((type ?? "").toLowerCase());
}

/**
 * Loads everything {@link evaluateBuyerRisk} needs and applies the automatic failed-payment lock.
 * Never throws: if the lookup fails the purchase is allowed (fail open) and the error is logged, so a DB
 * blip cannot take down checkout.
 */
export async function loadBuyerRisk(buyerId: string, amountCents: number | null = null): Promise<BuyerRisk> {
  const now = new Date();
  try {
    const [user, settledPaidOrders, recentFailedPayments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: buyerId },
        select: { createdAt: true, phoneVerifiedAt: true, purchasesLockedAt: true },
      }),
      prisma.order.count({
        where: {
          buyerId,
          paymentStatus: "paid",
          createdAt: { lte: new Date(now.getTime() - SETTLED_ORDER_AGE_DAYS * DAY_MS) },
        },
      }),
      prisma.order.count({
        where: {
          buyerId,
          paymentStatus: "failed",
          updatedAt: { gte: new Date(now.getTime() - FAILED_PAYMENT_LOCK_WINDOW_HOURS * 60 * 60 * 1000) },
        },
      }),
    ]);
    if (!user) return allowAll();

    const risk = evaluateBuyerRisk({
      now,
      accountCreatedAt: user.createdAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      purchasesLockedAt: user.purchasesLockedAt,
      settledPaidOrders,
      recentFailedPayments,
      amountCents,
    });
    if (risk.shouldAutoLock) await autoLockBuyer(buyerId, recentFailedPayments);
    return risk;
  } catch (e) {
    console.error("[buyer-payment-risk] risk lookup failed; allowing purchase", { buyerId, error: e });
    return allowAll();
  }
}

/** Convenience: load risk and return the purchase block (or null). */
export async function getBuyerPurchaseBlock(
  buyerId: string,
  amountCents: number | null = null,
): Promise<BuyerPurchaseBlock | null> {
  return buyerPurchaseBlock(await loadBuyerRisk(buyerId, amountCents));
}

function allowAll(): BuyerRisk {
  return {
    locked: false,
    shouldAutoLock: false,
    newBuyer: false,
    phoneVerified: true,
    phoneRequired: false,
    cardOnly: false,
    force3ds: false,
  };
}

async function autoLockBuyer(buyerId: string, failedCount: number): Promise<void> {
  const res = await prisma.user.updateMany({
    where: { id: buyerId, purchasesLockedAt: null },
    data: { purchasesLockedAt: new Date(), purchasesLockReason: AUTO_LOCK_REASON },
  });
  if (res.count === 0) return;
  await logTrustModerationAction({
    actorUserId: buyerId,
    action: "buyer_purchases_auto_locked",
    targetType: "user",
    targetId: buyerId,
    detail: { failedPayments: failedCount, windowHours: FAILED_PAYMENT_LOCK_WINDOW_HOURS },
  });
  scheduleNotifyAdmins({
    type: "admin_buyer_auto_locked",
    title: "Buyer locked after repeated failed payments",
    body: `An account had ${failedCount} failed payments in ${FAILED_PAYMENT_LOCK_WINDOW_HOURS} hours and can no longer buy until reviewed.`,
    href: `/admin/users/${encodeURIComponent(buyerId)}`,
    dedupeKey: `buyer_auto_lock_${buyerId}_${new Date().toISOString().slice(0, 10)}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Payout hold for risky sales
// ---------------------------------------------------------------------------------------------

export type RiskySaleInput = {
  orderCreatedAt: Date;
  /** Buyer total for the order in cents. Sales below {@link HIGH_VALUE_PURCHASE_CENTS} are never held. */
  orderTotalCents: number;
  walletPaymentMethodType: string | null;
  buyerAccountCreatedAt: Date;
  /** Buyer's paid orders created at least {@link SETTLED_ORDER_AGE_DAYS} days before this order. */
  buyerSettledPaidOrdersBefore: number;
  /** Seller's paid sales created before this order. */
  sellerPaidSalesBefore: number;
};

export type RiskySalePayoutHold = { held: boolean; holdUntil: Date | null; reasons: string[] };

export function evaluateRiskySalePayoutHold(input: RiskySaleInput, now: Date = new Date()): RiskySalePayoutHold {
  if (input.orderTotalCents < HIGH_VALUE_PURCHASE_CENTS) return { held: false, holdUntil: null, reasons: [] };
  const reasons: string[] = [];
  const buyerAgeAtOrderDays =
    (input.orderCreatedAt.getTime() - input.buyerAccountCreatedAt.getTime()) / DAY_MS;
  if (buyerAgeAtOrderDays < NEW_BUYER_ACCOUNT_AGE_DAYS || input.buyerSettledPaidOrdersBefore === 0) {
    reasons.push("new_buyer");
  }
  if (input.sellerPaidSalesBefore < NEW_SELLER_PAID_SALES) reasons.push("new_seller");
  if (paymentMethodTypeBlockedForCardOnly(input.walletPaymentMethodType)) reasons.push("non_card_payment");

  if (reasons.length === 0) return { held: false, holdUntil: null, reasons };
  const holdUntil = new Date(input.orderCreatedAt.getTime() + RISKY_SALE_PAYOUT_HOLD_DAYS * DAY_MS);
  return holdUntil.getTime() > now.getTime()
    ? { held: true, holdUntil, reasons }
    : { held: false, holdUntil, reasons };
}

/** Loads the inputs for {@link evaluateRiskySalePayoutHold}. Throws on DB errors; callers should hold. */
export async function loadRiskySalePayoutHold(orderId: string): Promise<RiskySalePayoutHold> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      createdAt: true,
      totalUsd: true,
      walletPaymentMethodType: true,
      buyerId: true,
      sellerId: true,
      buyer: { select: { createdAt: true } },
    },
  });
  if (!order) return { held: false, holdUntil: null, reasons: [] };
  const orderTotalCents = Math.round(order.totalUsd * 100);
  if (orderTotalCents < HIGH_VALUE_PURCHASE_CENTS) return { held: false, holdUntil: null, reasons: [] };
  const [buyerSettledPaidOrdersBefore, sellerPaidSalesBefore] = await Promise.all([
    prisma.order.count({
      where: {
        buyerId: order.buyerId,
        paymentStatus: "paid",
        createdAt: { lte: new Date(order.createdAt.getTime() - SETTLED_ORDER_AGE_DAYS * DAY_MS) },
      },
    }),
    prisma.order.count({
      where: { sellerId: order.sellerId, paymentStatus: "paid", createdAt: { lt: order.createdAt } },
    }),
  ]);
  return evaluateRiskySalePayoutHold({
    orderCreatedAt: order.createdAt,
    orderTotalCents,
    walletPaymentMethodType: order.walletPaymentMethodType,
    buyerAccountCreatedAt: order.buyer.createdAt,
    buyerSettledPaidOrdersBefore,
    sellerPaidSalesBefore,
  });
}
