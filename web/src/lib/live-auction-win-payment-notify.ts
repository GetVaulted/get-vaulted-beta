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
  const needsAuth =
    args.charge.outcome === "requires_action" || args.charge.outcome === "processing";

  const buyerBody = paid
    ? `You won “${titleShort}” at ${priceStr}. Your saved card was charged. Open your order for details.`
    : needsAuth
      ? `You won “${titleShort}” at ${priceStr}. Complete payment on your order — your bank may require an extra step.`
      : `You won “${titleShort}” at ${priceStr}. We could not charge your card automatically. Open your order and pay within 30 minutes.`;

  const sellerTitle = paid ? "Auction ended — paid" : "Auction ended — payment pending";
  const sellerBody = paid
    ? `Payment received for “${titleShort}”.`
    : needsAuth
      ? `The winner may need to complete authentication for “${titleShort}”.`
      : `Winner has 30 minutes to pay for “${titleShort}”. You will be notified when payment clears.`;

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
