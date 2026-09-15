/**
 * Matches web Seller Hub `awaitingShipmentCount`
 * (`paymentStatus=paid`, `fulfillmentStatus` in pending/processing, not cancelled).
 */
const AWAITING_FULFILLMENT = new Set(['pending', 'processing']);

export function isAwaitingShipmentSale(order: {
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  status?: string | null;
}): boolean {
  if (order.paymentStatus !== 'paid') return false;
  const status = (order.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return false;
  return AWAITING_FULFILLMENT.has((order.fulfillmentStatus ?? '').toLowerCase());
}

export function countAwaitingShipmentSales(
  orders: Array<{
    paymentStatus?: string | null;
    fulfillmentStatus?: string | null;
    status?: string | null;
  }>,
): number {
  return orders.reduce((n, o) => n + (isAwaitingShipmentSale(o) ? 1 : 0), 0);
}
