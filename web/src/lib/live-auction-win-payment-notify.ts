import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import type { ChargeOrderSavedPmOutcome } from "@/lib/stripe-charge-order-saved-pm";

/** Buyer/seller notifications after live auction win auto-charge attempt. */
export async function notifyLiveAuctionWinPaymentOutcome(args: {
  buyerId: string;
  sellerId: string;
  orderId: string;
  listingTitle: string;
  itemPriceUsd: number;
  charge: ChargeOrderSavedPmOutcome;
}): Promise<void> {
  const titleShort =
    args.listingTitle.length > 80 ? `${args.listingTitle.slice(0, 77)}…` : args.listingTitle;
  const priceStr = args.itemPriceUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const paid = args.charge.outcome === "paid";
  const paymentFailed = args.charge.outcome === "error";
  const needsAuth =
    args.charge.outcome === "requires_action" || args.charge.outcome === "processing";

  const buyerBody = paid
    ? `You won "${titleShort}" at ${priceStr}. Your saved card was charged. Open your order for details.`
    : needsAuth
      ? `You won "${titleShort}" at ${priceStr}. Complete payment in the show — your bank may require an extra step.`
      : `You won "${titleShort}" at ${priceStr}. We could not charge your card. Update your payment method in the show before the host continues.`;

  const sellerTitle = paid
    ? "Auction ended — approved"
    : paymentFailed
      ? "Auction ended — declined"
      : "Auction ended — payment pending";
  const sellerBody = paid
    ? `Payment received for "${titleShort}".`
    : paymentFailed
      ? `Auto-charge declined for "${titleShort}". The winner must update payment before you start the next lot.`
      : needsAuth
        ? `The winner may need to complete authentication for "${titleShort}".`
        : `Winner must update payment for "${titleShort}" before the show continues.`;

  await createNotification(prisma, {
    userId: args.buyerId,
    type: "auction_won",
    title: paid ? "You won the auction" : "You won — payment needed",
    body: buyerBody,
    href: `/orders/${encodeURIComponent(args.orderId)}`,
  });
  await createNotification(prisma, {
    userId: args.sellerId,
    type: "auction_pending_payment",
    title: sellerTitle,
    body: sellerBody,
    href: "/account/sales",
  });
}
