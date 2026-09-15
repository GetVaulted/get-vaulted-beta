import type { TradeOfferVM } from '../types/tradeOffers';

/** Who pays / receives optional trade cash (mirrors web resolveTradeCashParties). */
export function resolveMobileTradeCashParties(offer: Pick<
  TradeOfferVM,
  'sender_id' | 'recipient_id' | 'cash_difference'
>): { amountUsd: number; payerUserId: string; payeeUserId: string } | null {
  const cash = Number(offer.cash_difference) || 0;
  if (cash > 0) {
    return {
      amountUsd: cash,
      payerUserId: offer.sender_id,
      payeeUserId: offer.recipient_id,
    };
  }
  if (cash < 0) {
    return {
      amountUsd: Math.abs(cash),
      payerUserId: offer.recipient_id,
      payeeUserId: offer.sender_id,
    };
  }
  return null;
}

/** Statuses where on-platform cash checkout is allowed (web: accepted | completed). */
export function isTradeCashCheckoutStatus(status: string): boolean {
  return (
    status === 'accepted' ||
    status === 'completed' ||
    status === 'fee_due' ||
    status === 'labels_pending' ||
    status === 'labels_generating' ||
    status === 'labels_generated' ||
    status === 'label_error' ||
    status === 'shipped' ||
    status === 'delivered'
  );
}
