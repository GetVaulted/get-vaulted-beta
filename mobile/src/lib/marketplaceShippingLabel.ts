import { formatMarketplaceUsd } from './formatMarketplaceUsd';

/**
 * Shipping note for a marketplace tile — only when the seller set a real flat price.
 *
 * A stored shipping price of 0 (or none) does NOT mean free shipping: the app and the web treat
 * it as "carrier-calculated at checkout". That is the default for almost every listing, so the
 * tile says nothing rather than repeating "Shipping at checkout" under every price.
 */
export function marketplaceShippingLabel(shippingPriceUsd: number | null | undefined): string | null {
  if (typeof shippingPriceUsd === 'number' && Number.isFinite(shippingPriceUsd) && shippingPriceUsd > 0) {
    return `+${formatMarketplaceUsd(shippingPriceUsd)} shipping`;
  }
  return null;
}
