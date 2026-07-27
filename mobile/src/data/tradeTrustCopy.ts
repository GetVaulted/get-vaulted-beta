/**
 * Honest Trade Center trust copy — keep aligned with web/src/lib/trade-trust-copy.ts.
 */

export const TRADE_HOW_IT_WORKS_STEPS = [
  'Add your item(s)',
  'Choose what you want',
  'Add cash if needed (optional)',
  'Send offer — they accept, counter, or decline',
  'Each side pays fee + label, marks shipped, then confirms receipt to complete',
] as const;

export const TRADE_COVERS_BULLETS = [
  'Structured offers with locked terms, status history, and accept / counter / decline',
  '$2.99 Get Vaulted platform fee + your outbound Shippo label in one Stripe checkout after accept',
  'Straight trades: each side pays a refundable security deposit — 25% of the higher-side item value ($100 min / $500 max), held until both confirm receipt, then refunded',
  'Trades with cash: optional cash held by Get Vaulted until both confirm receipt (released to payee, or refunded on dispute)',
  'In-app ship + receive steps with partner tracking; open a dispute to freeze release if something goes wrong',
  'Notifications when offers arrive, change, or get accepted',
] as const;

export const TRADE_HANDLES_BULLETS = [
  'Packing and shipping your own item with the purchased label',
  'Paying your fee + label (and deposit on straight trades, or cash when the deal includes it)',
  'Marking shipped and confirming receipt so both of you finish the swap in Trade Center',
] as const;

export const TRADE_CASH_SETTLEMENT_NOTE =
  'Optional cash is recorded on the offer. After accept, the party adding cash can pay it on Get Vaulted — Get Vaulted holds that cash until both confirm receipt (or an admin resolves a dispute). Stripe card fees apply. Or settle off-platform.';

export const TRADE_AFTER_ACCEPT_NOTE =
  'Get Vaulted records the deal and sells shipping labels. Straight trades use a refundable deposit each side (25% of higher-side value, $100–$500); cash trades hold the cash until both confirm. After labels, mark shipped and confirm receipt — both confirms complete the trade and release/refund held funds. Items are not held in escrow.';

export const TRADE_FULFILLMENT_NOTE =
  'After you buy your label (and deposit on straight trades): ship the package, mark shipped here, then confirm receipt when their package arrives. The trade completes when both of you confirm — deposits are refunded and held cash is released.';

export const TRADE_BUYER_PITCH =
  "We trade through Get Vaulted Trade Center: locked offer terms, accept/counter in-app, then each of us pays the $2.99 fee + shipping label, marks shipped, and confirms receipt to complete. Straight trades include a refundable deposit each side — 25% of the higher-side value ($100 min / $500 max), refunded when both confirm. Optional cash on a deal is held until both confirm. Get Vaulted doesn’t hold items in escrow.";

export const TRADE_BUILDER_TRUST_CALLOUT =
  'After they accept, each of you pays $2.99 + your outbound label. Straight trades also require a refundable deposit (25% of higher-side value, $100–$500). Then mark shipped and confirm receipt — both confirms finish the trade and refund deposits / release cash.';

export const TRADE_HERO_SUB =
  'Structured offers, 25% refundable deposits on straight trades, and held cash until both confirm — built for collector-to-collector trades.';

export const TRADE_HERO_CHIPS = ['Structured offers', '25% deposits', 'Cash held until confirm'] as const;

export const TRADE_FEE_INCLUDES_BULLETS = [
  '$2.99 Get Vaulted platform fee + your outbound Shippo label in one charge',
  'Shipping is quoted at the actual carrier rate at checkout',
  TRADE_CASH_SETTLEMENT_NOTE,
] as const;

/** Deposit rules — keep aligned with web/src/lib/trade-security-deposit.ts */
export const TRADE_SECURITY_DEPOSIT_PERCENT = 0.25;
export const TRADE_SECURITY_DEPOSIT_MIN_USD = 100;
export const TRADE_SECURITY_DEPOSIT_MAX_USD = 500;

export function resolveMobileTradeSecurityDepositUsd(input: {
  cashDifference: number;
  offeredValueUsd: number;
  requestedValueUsd: number;
  securityDepositCents?: number | null;
}): number | null {
  if (Math.abs(input.cashDifference) > 0) return null;
  if (input.securityDepositCents != null && input.securityDepositCents > 0) {
    return Math.round(input.securityDepositCents) / 100;
  }
  const higher = Math.max(0, input.offeredValueUsd, input.requestedValueUsd);
  const raw = higher * TRADE_SECURITY_DEPOSIT_PERCENT;
  const clamped = Math.min(
    TRADE_SECURITY_DEPOSIT_MAX_USD,
    Math.max(TRADE_SECURITY_DEPOSIT_MIN_USD, raw),
  );
  return Math.round(clamped * 100) / 100;
}
