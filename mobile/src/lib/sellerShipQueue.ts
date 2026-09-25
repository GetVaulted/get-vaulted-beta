/**
 * Seller shipping queue stages — mirrors web `seller-ship-queue.ts`.
 * Needs label → Pending shipment → Shipped → Complete
 */

export type SellerShipQueuePhase =
  | 'needs_label'
  | 'print_and_ship'
  | 'awaiting_carrier'
  | 'in_transit'
  | 'wait_payment'
  | 'done'
  | 'other';

export type SellerShipQueueStage =
  | 'needs_label'
  | 'pending_shipment'
  | 'shipped'
  | 'complete'
  | 'wait_payment'
  | 'other';

export type SellerShipQueueOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  trackingNumber: string | null;
};

export function sellerMayShowFulfillmentControls(order: { paymentStatus: string }): boolean {
  return order.paymentStatus === 'paid';
}

export function sellerShipQueuePhase(order: SellerShipQueueOrder): SellerShipQueuePhase {
  if (order.paymentStatus === 'pending_payment') return 'wait_payment';
  if (order.paymentStatus !== 'paid') return 'other';
  if (order.fulfillmentStatus === 'delivered' || order.status === 'delivered') return 'done';
  if (order.fulfillmentStatus === 'in_transit' || order.fulfillmentStatus === 'out_for_delivery') {
    return 'in_transit';
  }
  if (order.status === 'shipped' || order.fulfillmentStatus === 'shipped') {
    return 'awaiting_carrier';
  }
  const hasLabel =
    order.fulfillmentStatus !== 'exception' &&
    Boolean(order.shippoTransactionId?.trim() || order.labelUrl?.trim());
  if (!hasLabel) return 'needs_label';
  return 'print_and_ship';
}

export function sellerShipQueueStage(order: SellerShipQueueOrder): SellerShipQueueStage {
  const phase = sellerShipQueuePhase(order);
  if (phase === 'needs_label') return 'needs_label';
  if (phase === 'print_and_ship' || phase === 'awaiting_carrier') return 'pending_shipment';
  if (phase === 'in_transit') return 'shipped';
  if (phase === 'done') return 'complete';
  if (phase === 'wait_payment') return 'wait_payment';
  return 'other';
}

export function sellerShipQueueEligible(order: SellerShipQueueOrder): boolean {
  return sellerMayShowFulfillmentControls(order);
}

export function orderIdsAwaitingBundledLabel(
  sessions: {
    bundled: boolean;
    canCreateBundledLabel: boolean;
    orders: { id: string; shipAlone: boolean; paymentStatus: string; hasLabel: boolean }[];
  }[],
): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (!session.bundled || !session.canCreateBundledLabel) continue;
    for (const order of session.orders) {
      if (order.shipAlone || order.paymentStatus !== 'paid' || order.hasLabel) continue;
      ids.add(order.id);
    }
  }
  return ids;
}

export function countShipQueueActions(
  orders: SellerShipQueueOrder[],
  opts?: { skipOrderIds?: Set<string> },
): {
  needsLabel: number;
  pendingShipment: number;
  shipped: number;
  complete: number;
  waitPayment: number;
} {
  const skip = opts?.skipOrderIds ?? new Set<string>();
  let needsLabel = 0;
  let pendingShipment = 0;
  let shipped = 0;
  let complete = 0;
  let waitPayment = 0;

  for (const order of orders) {
    if (!sellerShipQueueEligible(order)) continue;
    if (skip.has(order.id)) continue;
    const stage = sellerShipQueueStage(order);
    if (stage === 'needs_label') needsLabel += 1;
    else if (stage === 'pending_shipment') pendingShipment += 1;
    else if (stage === 'shipped') shipped += 1;
    else if (stage === 'complete') complete += 1;
    else if (stage === 'wait_payment') waitPayment += 1;
  }

  return { needsLabel, pendingShipment, shipped, complete, waitPayment };
}
