import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";

/** @deprecated Legacy bid rows only — never accepted on new POST /api/bids. */
const LEGACY_PRIMARY = "placeholder_card";
const LEGACY_SECONDARY = "placeholder_card_backup";

/** Admin / support display for stored `Bid.paymentLabel` / order payment labels. */
export function describeAuctionChargeSlotForAdmin(label: string): string {
  if (label === LEGACY_PRIMARY) return "Legacy placeholder (Visa slot)";
  if (label === LEGACY_SECONDARY) return "Legacy placeholder (Mastercard slot)";
  if (isStripePaymentMethodId(label)) return `Saved card (${label.slice(0, 10)}…)`;
  return label;
}
