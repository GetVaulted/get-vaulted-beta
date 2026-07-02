/** In-app + push copy for successful live-room buyer payments (no team/spot reveal text). */

export function formatLivePaymentAmountUsd(amountUsd: number): string {
  return amountUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function liveRoomBuyerPaymentConfirmedNotification(args: {
  amountUsd: number;
  href: string;
}): {
  type: "purchase_complete";
  title: string;
  body: string;
  href: string;
} {
  const amount = formatLivePaymentAmountUsd(Math.max(0, args.amountUsd));
  return {
    type: "purchase_complete",
    title: "Payment confirmed",
    body: `${amount} charged for your live purchase.`,
    href: args.href,
  };
}
