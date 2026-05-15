import type { TradeOfferVM } from '../types/tradeOffers';

export type TradeSections = {
  incoming: TradeOfferVM[];
  counters: TradeOfferVM[];
  sent: TradeOfferVM[];
  active: TradeOfferVM[];
  completed: TradeOfferVM[];
};

const ACTIVE = new Set([
  'accepted',
  'fee_due',
  'labels_pending',
  'labels_generating',
  'labels_generated',
  'label_error',
  'shipped',
  'delivered',
  'disputed',
]);

const INCOMING = new Set(['sent', 'awaiting_response']);

export function partitionTradeOffers(vm: TradeOfferVM[], userId: string): TradeSections {
  const incoming = vm.filter((o) => o.recipient_id === userId && INCOMING.has(o.status));
  const counters = vm.filter((o) => o.status === 'countered');
  const sent = vm.filter((o) => o.sender_id === userId && INCOMING.has(o.status));
  const active = vm.filter((o) => (o.sender_id === userId || o.recipient_id === userId) && ACTIVE.has(o.status));
  const completed = vm.filter((o) => o.status === 'completed');
  return { incoming, counters, sent, active, completed };
}
