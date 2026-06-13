/** Format listing/asking prices — show cents when the seller entered them. */
export function formatMarketplaceUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  const cents = Math.round(amount * 100);
  const hasCents = cents % 100 !== 0;
  const normalized = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(normalized);
  } catch {
    return hasCents ? `$${normalized.toFixed(2)}` : `$${normalized.toLocaleString('en-US')}`;
  }
}
