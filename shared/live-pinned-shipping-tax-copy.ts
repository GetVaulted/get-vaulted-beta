/**
 * Single source of truth for the buyer "pinned item" shipping + tax line shown in the live-room
 * pinned action bar (mobile + web parity). Rules:
 *  - Always show a shipping charge; when the per-show cap is met / free shipping → "Free shipping".
 *  - No tax in the buyer's jurisdiction → "Tax $0".
 *  - Auction lot (final price unknown until it sells) with tax → "+ Tax" (no amount).
 *  - Buy-it-now lot with tax → the computed tax amount ("Tax $X.XX").
 */

function usd(n: number): string {
  return Math.max(0, n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** "Free shipping" or "Shipping $X.XX" from the server-computed shipping display string. */
export function formatPinnedShippingLabel(shippingDisplay: string | null | undefined): string {
  const d = (shippingDisplay ?? "").trim();
  if (!d) return "Shipping at checkout";
  if (/free/i.test(d)) return "Free shipping";
  return `Shipping ${d}`;
}

/**
 * Tax label per lot type:
 *  - no tax → "Tax $0"
 *  - auction + tax → "+ Tax"
 *  - buy-now + tax → "Tax $X.XX"
 */
export function formatPinnedTaxLabel(args: {
  isAuction: boolean;
  taxApplies: boolean;
  taxUsd: number;
}): string {
  if (!args.taxApplies) return "Tax $0";
  if (args.isAuction) return "+ Tax";
  return `Tax ${usd(args.taxUsd)}`;
}

/** Full pinned-box shipping + tax line, e.g. "Shipping $3.99 · + Tax" or "Free shipping · Tax $0". */
export function formatPinnedShippingTaxLine(args: {
  isAuction: boolean;
  shippingDisplay: string | null | undefined;
  taxApplies: boolean;
  taxUsd: number;
}): string {
  return `${formatPinnedShippingLabel(args.shippingDisplay)} · ${formatPinnedTaxLabel(args)}`;
}
