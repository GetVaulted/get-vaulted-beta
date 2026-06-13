import type { MarketplaceCheckoutRateQuote } from "@/lib/marketplace-shipping-offer";

function formatUsdAmount(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function usesCarrierCalculatedShipping(flatShippingUsd?: number | null): boolean {
  return flatShippingUsd == null || flatShippingUsd <= 0;
}

/** Lowest–highest Shippo quote range, sorted ascending by amount. */
export function formatShippingRateRangeDisplay(rates: MarketplaceCheckoutRateQuote[]): string | null {
  const amounts = rates
    .map((rate) => Number(rate.amount))
    .filter((amount) => Number.isFinite(amount) && amount >= 0)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return null;
  const low = amounts[0]!;
  const high = amounts[amounts.length - 1]!;
  if (Math.abs(low - high) < 0.005) return formatUsdAmount(low);
  return `${formatUsdAmount(low)} – ${formatUsdAmount(high)}`;
}

export function normalizeHandlingEstimate(label?: string | null): string {
  const trimmed = label?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") {
    return "Typically ships within 1–2 business days";
  }
  return trimmed;
}
