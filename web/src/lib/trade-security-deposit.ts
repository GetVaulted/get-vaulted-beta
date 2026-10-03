/** Mutual refundable deposit on straight ($0 cash) trades — % of higher side item value. */
export const TRADE_SECURITY_DEPOSIT_PERCENT = 0.25;
export const TRADE_SECURITY_DEPOSIT_MIN_USD = 100;
export const TRADE_SECURITY_DEPOSIT_MAX_USD = 500;

export type TradeDepositValueInput = {
  proposerCashUsd: number;
  recipientCashUsd: number;
  /** Snapshot listing prices by side (locked after accept). */
  proposerItemsValueUsd: number;
  recipientItemsValueUsd: number;
  /** Locked deposit from DB once first checkout starts (cents). */
  securityDepositCents?: number | null;
};

/** Straight trades (no on-platform cash) use mutual deposits for skin-in-the-game protection. */
export function tradeRequiresSecurityDeposit(offer: {
  proposerCashUsd: number;
  recipientCashUsd: number;
}): boolean {
  return Math.max(0, offer.proposerCashUsd) + Math.max(0, offer.recipientCashUsd) <= 0;
}

/** Higher of the two sides' item snapshot totals. */
export function tradeHigherSideItemsValueUsd(input: {
  proposerItemsValueUsd: number;
  recipientItemsValueUsd: number;
}): number {
  return Math.max(0, input.proposerItemsValueUsd, input.recipientItemsValueUsd);
}

/**
 * 25% of higher-side item value, clamped to $100–$500.
 * If `securityDepositCents` is already locked on the offer, that wins.
 */
export function resolveTradeSecurityDepositUsd(input: TradeDepositValueInput): number {
  if (input.securityDepositCents != null && input.securityDepositCents > 0) {
    return Math.round(input.securityDepositCents) / 100;
  }
  const higher = tradeHigherSideItemsValueUsd(input);
  const raw = higher * TRADE_SECURITY_DEPOSIT_PERCENT;
  const clamped = Math.min(
    TRADE_SECURITY_DEPOSIT_MAX_USD,
    Math.max(TRADE_SECURITY_DEPOSIT_MIN_USD, raw),
  );
  return Math.round(clamped * 100) / 100;
}

export function tradeSecurityDepositCentsFromUsd(amountUsd: number): number {
  return Math.max(1, Math.round(amountUsd * 100));
}
