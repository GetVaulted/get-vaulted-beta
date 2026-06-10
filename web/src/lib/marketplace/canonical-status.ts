import { LayawayStatus } from "@/generated/prisma/enums";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";
import { deriveBuyerLayawayUi } from "@/lib/layaway/buyer-ui-status";

/** Single canonical marketplace item / layaway / order state for all clients. */
export type MarketplaceCanonicalStatus =
  | "available"
  | "layaway_reserved"
  | "layaway_active"
  | "layaway_paid_in_full"
  | "sold"
  | "canceled"
  | "defaulted";

export type ResolveMarketplaceCanonicalStatusInput = {
  listingStatus: string;
  orderPaymentStatus?: string | null;
  layawayStatus?: string | null;
  remainingBalanceUsd?: number | null;
  amountPaidUsd?: number | null;
  depositAmountUsd?: number | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Resolve authoritative item state from backend listing/order/layaway fields. */
export function resolveMarketplaceCanonicalStatus(
  input: ResolveMarketplaceCanonicalStatusInput,
): MarketplaceCanonicalStatus {
  const listingStatus = norm(input.listingStatus);
  const layawayStatus = norm(input.layawayStatus);
  const orderPaymentStatus = norm(input.orderPaymentStatus);
  const remaining = Math.max(0, input.remainingBalanceUsd ?? 0);

  if (layawayStatus === LayawayStatus.defaulted) return "defaulted";
  if (layawayStatus === LayawayStatus.refunded) return "canceled";
  if (orderPaymentStatus === "cancelled" || orderPaymentStatus === "expired") return "canceled";

  if (
    listingStatus === "sold" ||
    orderPaymentStatus === PAYMENT_PAID ||
    layawayStatus === LayawayStatus.completed ||
    layawayStatus === "paid_off"
  ) {
    if (layawayStatus === LayawayStatus.completed || layawayStatus === "paid_off") {
      return "layaway_paid_in_full";
    }
    return "sold";
  }

  if (listingStatus === "layaway_reserved" || layawayStatus === LayawayStatus.active) {
    const buyerUi = deriveBuyerLayawayUi({
      status: layawayStatus || LayawayStatus.active,
      amountPaidUsd: input.amountPaidUsd ?? 0,
      depositAmountUsd: input.depositAmountUsd ?? 0,
      remainingBalanceUsd: remaining,
      orderPaymentStatus: input.orderPaymentStatus ?? null,
    });
    if (buyerUi.phase === "pending_deposit") return "layaway_reserved";
    if (buyerUi.phase === "active") return "layaway_active";
    if (listingStatus === "layaway_reserved") return "layaway_reserved";
  }

  if (listingStatus === "active") return "available";

  if (listingStatus === "sold") return "sold";

  return "available";
}

export function isListingPurchasable(canonical: MarketplaceCanonicalStatus): boolean {
  return canonical === "available";
}

export function isActiveLayawayCanonical(canonical: MarketplaceCanonicalStatus): boolean {
  return canonical === "layaway_reserved" || canonical === "layaway_active";
}

export function isSellerFulfillmentCanonical(canonical: MarketplaceCanonicalStatus): boolean {
  return canonical === "sold" || canonical === "layaway_paid_in_full";
}

export {
  deriveSellerLayawayPresentation,
  isActiveLayawayListRow,
  orderQualifiesForSellerFulfillment,
  resolveLayawayCommerceCanonical,
} from "@/lib/marketplace/layaway-commerce-state";
