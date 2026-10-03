function truncateListingTitle(title: string, max = 90): string {
  const trimmed = title.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function formatSalePriceUsd(itemPriceUsd: number): string {
  return itemPriceUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Seller in-app + push notification when a marketplace listing sells. */
export function marketplaceSellerItemSoldNotification(args: {
  listingTitle: string;
  itemPriceUsd: number;
  orderId: string;
}) {
  const titleShort = truncateListingTitle(args.listingTitle);
  const priceStr = formatSalePriceUsd(args.itemPriceUsd);
  return {
    type: "item_sold" as const,
    title: "Your item sold",
    body: `“${titleShort}” sold for ${priceStr}. Create a shipping label from Sales or mark shipped when you send.`,
    href: `/orders/${encodeURIComponent(args.orderId)}`,
  };
}
