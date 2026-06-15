import type { SellerSalesOrderRow } from '../api/sellerSalesRepository';

export function filterLiveShowOrders(orders: SellerSalesOrderRow[], liveShowId: string | null | undefined): SellerSalesOrderRow[] {
  const id = liveShowId?.trim();
  if (!id) return [];
  return orders.filter((o) => o.liveShowId === id);
}

export function formatLiveOrderPaymentStatus(paymentStatus?: string): string {
  const ps = paymentStatus?.trim().toLowerCase() ?? '';
  if (ps === 'paid') return 'Paid';
  if (ps === 'pending_payment') return 'Awaiting payment';
  if (ps === 'payment_requires_action') return 'Auth required';
  if (ps === 'failed') return 'Payment failed';
  return paymentStatus?.replace(/_/g, ' ') ?? '—';
}
