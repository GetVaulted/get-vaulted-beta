import { formatMarketplaceUsd } from './formatMarketplaceUsd';

/**
 * One-line shipping note for a marketplace tile.
 *
 * A stored shipping price of 0 (or none) does NOT mean free shipping — the app and the web both
 * treat it as "carrier-calculated at checkout" (Shippo quote). Only a positive flat price is
 * shown as an amount; everything else says shipping is worked out at checkout.
 */
export function marketplaceShippingLabel(shippingPriceUsd: number | null | undefined): string {
  if (typeof shippingPriceUsd === 'number' && Number.isFinite(shippingPriceUsd) && shippingPriceUsd > 0) {
    return `+${formatMarketplaceUsd(shippingPriceUsd)} shipping`;
  }
  return 'Shipping at checkout';
}
