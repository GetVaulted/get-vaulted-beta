import type { TradeOfferStatus } from '../types/tradeOffers';

export const TRADE_STATUS_ORDER: TradeOfferStatus[] = [
  'sent',
  'awaiting_response',
  'countered',
  'accepted',
  'declined',
  'fee_due',
  'labels_pending',
  'labels_generating',
  'labels_generated',
  'label_error',
  'shipped',
  'delivered',
  'completed',
  'disputed',
];

export const TRADE_STATUS_LABEL: Record<TradeOfferStatus, string> = {
  sent: 'Sent',
  awaiting_response: 'Awaiting response',
  countered: 'Countered',
  accepted: 'Accepted',
  declined: 'Declined',
  fee_due: 'Fee due',
  labels_pending: 'Labels pending',
  labels_generating: 'Labels generating',
  labels_generated: 'Labels ready',
  label_error: 'Label error',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
};

export function displayTradeStatus(status: string): string {
  return TRADE_STATUS_LABEL[status as TradeOfferStatus] ?? status.replace(/_/g, ' ');
}

export function tradeStatusIndex(status: TradeOfferStatus): number {
  const i = TRADE_STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : 0;
}

export const TIMELINE_STEPS: { status: TradeOfferStatus; label: string }[] = [
  { status: 'awaiting_response', label: 'Offer live' },
  { status: 'countered', label: 'Counter' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'fee_due', label: 'Trade fee' },
  { status: 'labels_pending', label: 'Labels queued' },
  { status: 'labels_generating', label: 'Buying labels' },
  { status: 'labels_generated', label: 'Labels ready' },
  { status: 'label_error', label: 'Label issue' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'completed', label: 'Completed' },
];
