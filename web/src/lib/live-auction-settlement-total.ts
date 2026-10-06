/**
 * Live auction settlement totals (explicit breakdown for orders + charges).
 *
 * subtotal = winning bid (itemPriceUsd)
 * tax = Stripe Tax when nexus applies (uses buyer Wallet ship-to on saved-card charge)
 * shipping = bundled live session incremental cost (weight tiers, capped)
 * total = subtotal + tax + shipping
 */

export type LiveAuctionSettlementBreakdown = {
  subtotalUsd: number;
  taxUsd: number;
  shippingUsd: number;
  totalUsd: number;
  taxSource: "none" | "stripe_checkout" | "stripe_tax";
  shippingCapCents: number | null;
};

export function computeLiveAuctionSettlementBreakdown(args: {
  winningBidUsd: number;
  shippingUsd?: number;
  taxUsd?: number;
  shippingCapCents?: number | null;
  taxFromStripe?: boolean;
}): LiveAuctionSettlementBreakdown {
  const subtotalUsd = Math.max(0, args.winningBidUsd);
  const shippingUsd = Math.max(0, args.shippingUsd ?? 0);
  const taxUsd = Math.max(0, args.taxUsd ?? 0);
  const totalUsd = subtotalUsd + taxUsd + shippingUsd;
  const taxSource =
    taxUsd > 0 ? (args.taxFromStripe ? "stripe_tax" : "stripe_checkout") : "none";
  return {
    subtotalUsd,
    taxUsd,
    shippingUsd,
    totalUsd,
    taxSource,
    shippingCapCents: args.shippingCapCents ?? null,
  };
}
