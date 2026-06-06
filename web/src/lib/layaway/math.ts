import { LAYAWAY_DEPOSIT_FRACTION } from "@/lib/layaway/constants";

export function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function layawayDepositUsd(itemPriceUsd: number): number {
  return roundUsd(itemPriceUsd * LAYAWAY_DEPOSIT_FRACTION);
}

/** Remaining item balance after deposit (75% of item price). */
export function layawayItemBalanceUsd(itemPriceUsd: number): number {
  return roundUsd(itemPriceUsd - layawayDepositUsd(itemPriceUsd));
}

/** Full remaining balance including shipping (collected before shipment). */
export function layawayRemainingBalanceUsd(args: { itemPriceUsd: number; shippingPriceUsd: number }): number {
  return roundUsd(layawayItemBalanceUsd(args.itemPriceUsd) + Math.max(0, args.shippingPriceUsd));
}

/** Amount paid above the non-refundable deposit (refundable on default). */
export function layawayRefundableAboveDepositUsd(amountPaidUsd: number, depositAmountUsd: number): number {
  return roundUsd(Math.max(0, amountPaidUsd - depositAmountUsd));
}
